import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dbPath=resolve(process.env.DATABASE_PATH||join(root,'data','tilpro.sqlite'));
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher')), name TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', teacher_id TEXT REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS learner_state(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', due_at TEXT NOT NULL DEFAULT '', difficulty TEXT NOT NULL DEFAULT 'Орташа', status TEXT NOT NULL CHECK(status IN ('draft','published')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, answer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('in_progress','submitted','reviewed','redo')), score REAL, feedback TEXT NOT NULL DEFAULT '', submitted_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(assignment_id,user_id));
CREATE INDEX IF NOT EXISTS assignment_teacher_idx ON assignments(teacher_id,status);
CREATE INDEX IF NOT EXISTS submission_user_idx ON submissions(user_id,status);
`);

const now=()=>new Date().toISOString();
const userView=u=>({id:u.id,username:u.username,role:u.role,name:u.name,grade:u.grade,teacherId:u.teacher_id||null});
const cookieName='tilpro_session';
const secure=process.env.NODE_ENV==='production';
const tokenDigest=token=>createHash('sha256').update(token).digest('hex');
const passwordHash=password=>{const salt=randomBytes(16);return `scrypt$${salt.toString('hex')}$${scryptSync(password,salt,64).toString('hex')}`};
const passwordMatches=(password,stored)=>{try{const [algo,saltHex,keyHex]=stored.split('$');if(algo!=='scrypt')return false;const expected=Buffer.from(keyHex,'hex'),actual=scryptSync(password,Buffer.from(saltHex,'hex'),expected.length);return expected.length===actual.length&&timingSafeEqual(expected,actual)}catch{return false}};
function send(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(data))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2_000_000)throw Object.assign(new Error('Сұрау көлемі тым үлкен.'),{status:413})}try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON пішімі жарамсыз.'),{status:400})}}
function setCookie(res,token,maxAge=7*24*60*60){res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`)}
function clearCookie(res){res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`)}
function requestToken(req){const bearer=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];if(bearer)return bearer;return(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||null}
function sessionUser(req){const token=requestToken(req);if(!token)return null;let decoded=token;try{decoded=decodeURIComponent(token)}catch{}const row=db.prepare('SELECT u.*,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenDigest(decoded),Date.now());return row||null}
function requireRole(user,role){if(!user)throw Object.assign(new Error('Жүйеге қайта кіріңіз.'),{status:401});if(user.role!==role)throw Object.assign(new Error('Бұл әрекетке құқық берілмеген.'),{status:403})}
function originAllowed(origin,req){if(!origin)return false;const allowed=(process.env.APP_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);const host=req.headers.host;let originHost='';try{originHost=new URL(origin).host}catch{return false}const same=originHost===host,localDev=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host||'');return same||localDev||allowed.includes(origin)}
function checkOrigin(req){const origin=req.headers.origin;if(origin&&!originAllowed(origin,req))throw Object.assign(new Error('Сұрау көзі рұқсат етілмеген.'),{status:403})}
function corsHeaders(req){const origin=req.headers.origin;if(!origin||!originAllowed(origin,req))return{};return{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Vary':'Origin'}}
function getState(userId){const row=db.prepare('SELECT data FROM learner_state WHERE user_id=?').get(userId);return row?JSON.parse(row.data):{records:[],known:[],favorites:[],xp:0,streak:0,last:'',diagnosed:false,diagnosticScore:null,diagnosticRuns:[],dictations:[],errors:[],weeklyResults:[],goal:3,notifications:[]}}
function storeState(userId,payload,user){const data=payload?.state&&typeof payload.state==='object'?payload.state:payload;if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(new Error('Оқу деректері жарамсыз.'),{status:400});const safe={...data};for(const key of ['accounts','teacherStudents','assignments','password','passwordHash','authenticated','email','role','name','grade'])delete safe[key];db.prepare('INSERT INTO learner_state(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(user.id,JSON.stringify(safe),now());return {...safe,role:user.role,name:user.name,grade:user.grade,email:user.username,authenticated:true,assignments:[]}}
function newSession(res,user){const token=randomBytes(32).toString('base64url'),expires=Date.now()+7*24*60*60*1000;db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenDigest(token),user.id,expires);setCookie(res,token);return token}
function assignmentView(a,submission=null){return {id:a.id,title:a.title,topic:a.topic,instructions:a.instructions,content:a.content,due:a.due_at,difficulty:a.difficulty,status:a.status,student:a.target_username||null,done:submission?.status==='reviewed',submission:submission?{id:submission.id,username:submission.username,student:submission.student_name,answer:submission.answer,status:submission.status,score:submission.score,feedback:submission.feedback,submittedAt:submission.submitted_at}:null,createdAt:a.created_at}}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      const cors=corsHeaders(req);for(const[key,value]of Object.entries(cors))res.setHeader(key,value);
      if(req.method==='OPTIONS')return res.writeHead(req.headers.origin&&!cors['Access-Control-Allow-Origin']?403:204).end();
    }
    if(url.pathname.startsWith('/api/')&&['POST','PUT','PATCH','DELETE'].includes(req.method))checkOrigin(req);
    let user=sessionUser(req);
    if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true});
    if(req.method==='GET'&&url.pathname==='/api/auth/me')return send(res,200,{user:user?userView(user):null});
    if(req.method==='POST'&&url.pathname==='/api/auth/register'){
      const b=await body(req),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||''),name=String(b.name||'').trim(),grade=String(b.grade||'');
      if(!/^(?=.*[a-z])[a-z0-9_]{3,32}$/.test(username))return send(res,400,{error:'Логин 3–32 таңбадан тұрып, тек латын әріптері, сандар және _ белгісін қолдануы керек.'});
      if(password.length<6)return send(res,400,{error:'Құпиясөз кемінде 6 таңбадан тұруы керек.'});
      if(password.length>256)return send(res,400,{error:'Құпиясөз тым ұзын.'});
      if(name.length<2||name.length>120)return send(res,400,{error:'Аты-жөніңді дұрыс енгіз.'});
      if(db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username))return send(res,409,{error:'Бұл логин тіркелген, басқа логин таңдаңыз.'});
      let role='student';
      if(b.role==='teacher'){
        const expected=process.env.TEACHER_INVITE_CODE||'';const supplied=String(b.teacherCode||'');
        if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return send(res,403,{error:'Мұғалім тіркелуі үшін жарамды шақыру коды қажет.'});
        role='teacher';
      }
      let teacherId=null;
      if(role==='student'&&b.teacherLogin){const teacher=db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND role='teacher'").get(String(b.teacherLogin).trim());if(!teacher)return send(res,400,{error:'Мұғалім логині табылмады. Дұрыс логинді тексер.'});teacherId=teacher.id;}
      const id=randomUUID();db.prepare('INSERT INTO users(id,username,password_hash,role,name,grade,teacher_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,username,passwordHash(password),role,name,role==='student'?grade:'',teacherId,now());const created=db.prepare('SELECT * FROM users WHERE id=?').get(id),sessionToken=newSession(res,created);return send(res,201,{user:userView(created),state:getState(id),sessionToken});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/login'){
      const b=await body(req),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');const found=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username);
      if(!found||!passwordMatches(password,found.password_hash))return send(res,401,{error:'Логин немесе құпиясөз қате.'});
      db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<=?').run(found.id,Date.now());const sessionToken=newSession(res,found);return send(res,200,{user:userView(found),state:getState(found.id),sessionToken});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/logout'){
      const token=requestToken(req);if(token){let decoded=token;try{decoded=decodeURIComponent(token)}catch{}db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenDigest(decoded))}clearCookie(res);return send(res,200,{ok:true});
    }
    if(url.pathname.startsWith('/api/')){
      if(!user)return send(res,401,{error:'Жүйеге қайта кіріңіз.'});
      if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,{state:{...getState(user.id),role:user.role,name:user.name,grade:user.grade,email:user.username,authenticated:true,assignments:[]}});
      if(req.method==='PUT'&&url.pathname==='/api/state')return send(res,200,{state:storeState(user.id,await body(req),user)});
      if(req.method==='PATCH'&&url.pathname==='/api/profile'){
        const b=await body(req),name=String(b.name||'').trim(),grade=user.role==='student'?String(b.grade||''):'';
        if(name.length<2||name.length>120)return send(res,400,{error:'Аты-жөнің 2–120 таңба болуы керек.'});
        db.prepare('UPDATE users SET name=?,grade=? WHERE id=?').run(name,grade,user.id);
        return send(res,200,{user:{...userView(user),name,grade}});
      }
      if(req.method==='GET'&&url.pathname==='/api/students'){
        requireRole(user,'teacher');const students=db.prepare("SELECT u.*,s.data FROM users u LEFT JOIN learner_state s ON s.user_id=u.id WHERE u.teacher_id=? AND u.role='student' ORDER BY u.name COLLATE NOCASE").all(user.id).map(row=>{let d={};try{d=row.data?JSON.parse(row.data):{}}catch{}const records=d.records||[],run=d.diagnosticRuns?.[d.diagnosticRuns.length-1],topics=run?.byTopic||[],weak=topics.filter(x=>x.total).sort((a,b)=>a.correct/a.total-b.correct/b.total)[0],errors=(d.errors||[]).filter(x=>!x.fixed).sort((a,b)=>b.repeats-a.repeats)[0],score=typeof d.diagnosticScore==='number'?d.diagnosticScore:records.length?Math.round(records.filter(x=>x.correct).length/records.length*100):0;return {id:row.id,username:row.username,name:d.name||row.name,grade:d.grade||row.grade,level:run?score>=88?'B2':score>=72?'B1':score>=50?'A2':'A1':'—',score,xp:d.xp||0,weak:weak?.topic||errors?.topic||(run||records.length?'Күшті тақырып анықталмады':'Диагностика қажет'),diagnosed:Boolean(d.diagnosed),diagnosticScore:d.diagnosticScore??null,records,errors:d.errors||[],diagnosticRuns:d.diagnosticRuns||[]}});return send(res,200,{students});
      }
      if(req.method==='GET'&&url.pathname==='/api/assignments'){
        if(user.role==='teacher'){const list=db.prepare('SELECT a.*,tu.username AS target_username FROM assignments a LEFT JOIN users tu ON tu.id=a.target_user_id WHERE a.teacher_id=? ORDER BY a.created_at DESC').all(user.id);const result=list.map(a=>{const subs=db.prepare('SELECT s.*,u.username,u.name AS student_name FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.assignment_id=? ORDER BY s.submitted_at DESC').all(a.id);return {...assignmentView(a),submissions:subs.map(x=>({id:x.id,username:x.username,student:x.student_name,answer:x.answer,status:x.status,score:x.score,feedback:x.feedback,submittedAt:x.submitted_at}))}});return send(res,200,{assignments:result});}
        if(!user.teacher_id)return send(res,200,{assignments:[]});const list=db.prepare("SELECT a.*,tu.username AS target_username,s.id AS submission_id,s.answer AS submission_answer,s.status AS submission_status,s.score AS submission_score,s.feedback AS submission_feedback,s.submitted_at AS submission_date,u.username AS submission_username,u.name AS student_name FROM assignments a LEFT JOIN users tu ON tu.id=a.target_user_id LEFT JOIN submissions s ON s.assignment_id=a.id AND s.user_id=? LEFT JOIN users u ON u.id=s.user_id WHERE a.teacher_id=? AND a.status='published' AND (a.target_user_id IS NULL OR a.target_user_id=?) ORDER BY a.due_at,a.created_at DESC").all(user.id,user.teacher_id,user.id);return send(res,200,{assignments:list.map(a=>assignmentView(a,a.submission_id?{id:a.submission_id,answer:a.submission_answer,status:a.submission_status,score:a.submission_score,feedback:a.submission_feedback,submitted_at:a.submission_date,username:a.submission_username,student_name:a.student_name}:null))});
      }
      if(req.method==='POST'&&url.pathname==='/api/assignments'){
        requireRole(user,'teacher');const b=await body(req),title=String(b.title||'').trim();if(title.length<2)return send(res,400,{error:'Тапсырма атауын енгіз.'});let targetId=null;if(b.student){const student=db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND role='student' AND teacher_id=?").get(String(b.student),user.id);if(!student)return send(res,400,{error:'Бұл оқушы мұғалім аккаунтына тіркелмеген.'});targetId=student.id;}const id=randomUUID(),stamp=now();db.prepare('INSERT INTO assignments(id,teacher_id,target_user_id,title,topic,instructions,content,due_at,difficulty,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,targetId,title,String(b.topic||''),String(b.instructions||''),String(b.content||''),String(b.due||''),String(b.difficulty||'Орташа'),'draft',stamp,stamp);return send(res,201,{id,status:'draft'});
      }
      const match=url.pathname.match(/^\/api\/assignments\/([0-9a-f-]+)(?:\/(publish|submission|review))?$/i);
      if(match){const [,id,action]=match,a=db.prepare('SELECT a.*,tu.username AS target_username FROM assignments a LEFT JOIN users tu ON tu.id=a.target_user_id WHERE a.id=?').get(id);if(!a)return send(res,404,{error:'Тапсырма табылмады.'});
        if(action==='publish'&&req.method==='POST'){requireRole(user,'teacher');if(a.teacher_id!==user.id)return send(res,403,{error:'Бұл тапсырма сізге тиесілі емес.'});db.prepare("UPDATE assignments SET status='published',updated_at=? WHERE id=?").run(now(),id);return send(res,200,{ok:true,status:'published'});}
        if(action==='submission'&&req.method==='POST'){requireRole(user,'student');if(!user.teacher_id||user.teacher_id!==a.teacher_id||a.status!=='published'||(a.target_user_id&&a.target_user_id!==user.id))return send(res,403,{error:'Бұл тапсырма сізге жарияланбаған.'});const b=await body(req),answer=String(b.answer||'').trim();if(!answer)return send(res,400,{error:'Жауабыңды енгіз.'});const stamp=now();db.prepare("INSERT INTO submissions(id,assignment_id,user_id,answer,status,submitted_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(assignment_id,user_id) DO UPDATE SET answer=excluded.answer,status='submitted',score=NULL,feedback='',submitted_at=excluded.submitted_at,updated_at=excluded.updated_at").run(randomUUID(),id,user.id,answer,'submitted',stamp,stamp);return send(res,200,{ok:true,status:'submitted'});}
        if(action==='review'&&req.method==='PATCH'){requireRole(user,'teacher');if(a.teacher_id!==user.id)return send(res,403,{error:'Бұл тапсырма сізге тиесілі емес.'});const b=await body(req),submission=db.prepare('SELECT * FROM submissions WHERE id=? AND assignment_id=?').get(String(b.submissionId||''),id);if(!submission)return send(res,404,{error:'Оқушы жауабы табылмады.'});if(!['reviewed','redo'].includes(b.status))return send(res,400,{error:'Тексеру мәртебесі дұрыс емес.'});const score=b.score===null||b.score===undefined?null:Math.max(0,Math.min(100,Number(b.score)||0));db.prepare('UPDATE submissions SET status=?,score=?,feedback=?,updated_at=? WHERE id=?').run(b.status,score,String(b.feedback||''),now(),submission.id);return send(res,200,{ok:true});}
        if(req.method==='PUT'){requireRole(user,'teacher');if(a.teacher_id!==user.id)return send(res,403,{error:'Бұл тапсырма сізге тиесілі емес.'});const b=await body(req);db.prepare('UPDATE assignments SET title=?,topic=?,instructions=?,content=?,due_at=?,difficulty=?,status=?,updated_at=? WHERE id=?').run(String(b.title||a.title).trim(),String(b.topic??a.topic),String(b.instructions??a.instructions),String(b.content??a.content),String(b.due??a.due_at),String(b.difficulty??a.difficulty),b.status==='published'?'published':'draft',now(),id);return send(res,200,{ok:true});}
        if(req.method==='DELETE'){requireRole(user,'teacher');if(a.teacher_id!==user.id)return send(res,403,{error:'Бұл тапсырма сізге тиесілі емес.'});db.prepare('DELETE FROM assignments WHERE id=?').run(id);return send(res,200,{ok:true});}
        return send(res,405,{error:'Әдіс рұқсат етілмеген.'});
      }
      return send(res,404,{error:'API бағыты табылмады.'});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/assets/')){const file=resolve(root,'dist',url.pathname.slice(1));if(!file.startsWith(resolve(root,'dist')+sep)||!existsSync(file))return send(res,404,{error:'Файл табылмады.'});res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'public,max-age=31536000,immutable'});return res.end(readFileSync(file));}
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){const file=join(root,'dist','index.html');if(!existsSync(file)){res.writeHead(503,{'content-type':'text/plain; charset=utf-8'});return res.end('TilPro әлі құрастырылмады. npm run build орындаңыз.')}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});return res.end(readFileSync(file))}
    return send(res,404,{error:'Бет табылмады.'});
  }catch(error){if(res.headersSent){res.destroy();return}send(res,error.status||500,{error:error.status?error.message:'Сервер қатесі.'});if(!error.status)console.error(error)}
});

const port=Number(process.env.PORT||8787);
server.listen(port,'0.0.0.0',()=>console.log(`TilPro server listening on ${port}; persistent SQLite database: ${dbPath}`));
function close(){server.close(()=>{db.close();process.exit(0)})}
process.on('SIGINT',close);process.on('SIGTERM',close);
