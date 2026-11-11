import{useRef,useState}from'react';
type RecognitionResult={results:ArrayLike<{0:{transcript:string}}>;resultIndex:number};
type RecognitionLike={lang:string;interimResults:boolean;onresult:((event:RecognitionResult)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};
type Prompt={title:string;ask:string;sample:string;keywords:RegExp[]};
type Feedback={ok:boolean;summary:string;detail:string;sample:string};
type Props={record:(tag:string,correct:boolean,xp?:number,wrong?:string,answer?:string,explanation?:string)=>void};
const prompts:Prompt[]=[
  {title:'Танысу',ask:'Как тебя зовут и в каком классе ты учишься?',sample:'Меня зовут Аружан. Я учусь в седьмом классе.',keywords:[/зовут|имя/,/класс|учусь|ученик/]},
  {title:'Мектепке бағыт',ask:'Как ты обычно добираешься до школы?',sample:'Я обычно иду в школу пешком вместе с подругой.',keywords:[/школ/,/иду|езж|добира|автобус|пешком|машин/]},
  {title:'Демалыс күні',ask:'Что ты любишь делать в выходные?',sample:'В выходные я читаю книги и гуляю с друзьями.',keywords:[/выходн/,/чита|гуля|друз|люблю|игра|рису/]},
];
const commonErrors:[RegExp,string,string][]=[
  [/\bя\s+пош[её]л\s+в\s+школа\b/i,'«Пошёл куда?» — «в школу». Бағытты білдіргенде табыс септігі қолданылады.','Я пошёл в школу.'],
  [/\bв\s+школа\b/i,'«В школу» — бағыт, «в школе» — орын. Қай мағына керек екенін сұрақпен тексер.','Я иду в школу. / Я учусь в школе.'],
  [/\bмоя\s+брат\b|\bмой\s+сестра\b/i,'Сын есім зат есімнің родына сай болуы керек: «брат» — мужской, «сестра» — женский род.','Мой брат. / Моя сестра.'],
  [/\bнет\s+[а-яё]+\b/i,'«Нет» сөзінен кейін зат есім көбіне родительный падеж тұлғасында келеді. Сөздің жалғауын тексер.','У меня нет книги.'],
];
export default function SpeechPractice({record}:Props){
  const[index,I]=useState(0),[text,T]=useState(''),[status,S]=useState(''),[busy,B]=useState(false),[feedback,F]=useState<Feedback|null>(null),recog=useRef<RecognitionLike|null>(null),p=prompts[index];
  function listen(){
    const w=window as Window&{SpeechRecognition?:new()=>RecognitionLike;webkitSpeechRecognition?:new()=>RecognitionLike},Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Ctor){S('Бұл браузерде сөйлеуді тану қолжетімсіз. Жауабыңды мәтін түрінде енгізе аласың.');return}
    try{const r=new Ctor();recog.current=r;r.lang='ru-RU';r.interimResults=false;r.onresult=e=>{const phrase=Array.from(e.results).slice(e.resultIndex).map(x=>x[0].transcript).join(' ');T(old=>[old,phrase].filter(Boolean).join(' '));F(null);S('Сөйлеу мәтінге айналды. Қаласаң, тексерер алдында түзете аласың.')};r.onerror=e=>S(e.error==='not-allowed'?'Микрофонға рұқсат берілмеді. Браузер баптауынан рұқсат бер немесе мәтін енгіз.':'Дыбыс танылмады. Қайта айтып көр немесе мәтін енгіз.');r.onend=()=>B(false);B(true);S('Тыңдап жатырмын… Орысша жауап бер.');r.start()}catch{B(false);S('Микрофонды іске қосу мүмкін болмады. Жауабыңды мәтінмен енгіз.')}
  }
  function analyze(){
    const answer=text.trim();if(!answer)return;
    const lower=answer.toLocaleLowerCase(),words=answer.split(/\s+/).filter(Boolean),knownError=commonErrors.find(([pattern])=>pattern.test(lower)),relevant=p.keywords.some(pattern=>pattern.test(lower));
    const notes:string[]=[];if(knownError)notes.push(knownError[1]);if(words.length<5)notes.push('Жауабың қысқа. Кемінде 5 сөзден тұратын толық сөйлем құрап көр.');if(!relevant)notes.push(`Сұраққа сай сөздерді қосып көр. Үлгі: ${p.sample}`);
    const ok=!knownError&&words.length>=5&&relevant,detail=notes.join(' '),summary=ok?'Жауабың толық әрі тақырыпқа сай. Жақсы жұмыс!':knownError?'Жиі кездесетін грамматикалық үлгі анықталды. Түсіндірмені оқып, жауапты қайта құрастыр.':words.length<5?'Жауапты толық сөйлеммен кеңейт.':'Жауап сұрақ тақырыбымен жеткілікті байланыспады.';
    F({ok,summary,detail:detail||'Тақырыпқа қатысты сөз қолдандың. Бұл демо ұзақ мәтіндегі барлық грамматикалық қатені анықтай алмайды.',sample:knownError?.[2]||p.sample});
    record('Сөйлеу · '+p.title,ok,undefined,ok?undefined:answer,ok?undefined:p.sample,detail||'Жауап ұзындығы мен тақырыпқа сәйкестігі тексерілді. Толық айтылым бағасы жасалмайды.');
  }
  return <><header className="pagehead"><div><div className="eyebrow">СӨЙЛЕУ ЖАТТЫҒУЫ</div><h1>Орысша айтып көр</h1><p>Микрофонмен жауап бер немесе мәтінді өзің енгіз.</p></div></header>
    <div className="speak-layout"><section className="panel situation"><div className="situation-head"><span className="bigicon">◉</span><select value={index} onChange={e=>{I(+e.target.value);T('');F(null);S('')}}>{prompts.map((x,i)=><option value={i} key={x.title}>{x.title}</option>)}</select></div><h2>{p.title}</h2><p className="promptkk">{p.ask}</p><div className="example"><small>Үлгі жауап</small><b>{p.sample}</b></div>
      <label className="fieldlabel" htmlFor="speech-answer">Танылған не өзің жазған жауап</label><textarea id="speech-answer" className="dict-input" value={text} onChange={e=>{T(e.target.value);F(null)}} placeholder="Микрофонды бас немесе орысша жауап жаз…"/>
      <div className="filters"><button className="outline" onClick={listen} disabled={busy}>{busy?'Тыңдап жатыр…':'🎙 Микрофонмен жауап беру'}</button><button className="primary" disabled={!text.trim()} onClick={analyze}>Жауапқа кері байланыс алу →</button></div>{status&&<p className="mutedtext" role="status">{status}</p>}
      {feedback&&<div className={'practice-feedback '+(feedback.ok?'is-correct':'is-wrong')} role="status"><b>{feedback.summary}</b>{feedback.detail&&<p>{feedback.detail}</p>}{!feedback.ok&&<p><b>Үлгі жауап:</b> {feedback.sample}</p>}<small>Бұл демо жауаптың ұзындығы, тақырыпқа сәйкестігі және бірнеше жиі қатені қарайды. Айтылым сапасын толық бағаламайды.</small></div>}
    </section><aside className="panel phrasebox"><h3>Кері байланыс нені тексереді?</h3><div className="phrase"><span>1</span>Қолдаулы браузерде орысша сөйлеуді мәтінге айналдырады</div><div className="phrase"><span>2</span>Жауаптың толықтығы мен тақырыпқа сәйкестігін қарайды</div><div className="phrase"><span>3</span>Бірнеше жиі кездесетін қатеге қазақша түсіндірме береді</div><div className="tip"><b>Демо шектеуі</b><br/>Айтылымның дыбыстық сапасы мен толық грамматиканы бағалау үшін бөлек сөйлеу талдау қызметі қажет.</div></aside></div>
  </>;
}
