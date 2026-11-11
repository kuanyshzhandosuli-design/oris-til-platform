import {useState} from 'react';
import {questions,extraDiagnostic} from '../data/content';
import {explanationFor} from '../modules/learning';
import type {DiagnosticRun,State} from '../types';

type Difficulty=1|2|3;
type DiagnosticQuestion={tag:string;q:string;opts:string[];a:number;why:string;difficulty:Difficulty};
const coreQuiz:DiagnosticQuestion[]=questions.map(q=>({...q,difficulty:1}));
const advancedQuestions:DiagnosticQuestion[]=[
  {tag:'Грамматика · падежи',q:'Мы долго восхищались ___ (история) города.',opts:['история','историю','историей'],a:2,why:'«Восхищаться чем?» сұрағына творительный падеждегі «историей» сөзі жауап береді.',difficulty:3},
  {tag:'Грамматика · падежи',q:'Несмотря на дождь, дети продолжали играть во ___ (двор).',opts:['дворе','двор','двору'],a:0,why:'«Играть где?» сұрағына «во дворе» деп жауап береміз. Орынды білдіретін тіркесте предложный падеж қолданылады.',difficulty:3},
  {tag:'Грамматика · глаголы',q:'Когда прозвенел звонок, ученики уже ___ упражнение.',opts:['выполняли','выполнили','выполняют'],a:1,why:'Оқушылар қоңырау соғылғанға дейін тапсырманы аяқтап қойған. Аяқталған нәтижені білдіретін «выполнили» түрі керек.',difficulty:3},
  {tag:'Грамматика · согласование',q:'Мы любовались ___ (осенний лес).',opts:['осенний лес','осеннего леса','осенним лесом'],a:2,why:'«Любоваться чем?» сұрағынан кейін творительный падеж келеді: осенним лесом.',difficulty:3},
  {tag:'Чтение',q:'Айжан обычно едет в школу на автобусе. Сегодня автобус не пришёл, поэтому она позвонила папе, и он отвёз её на машине. Почему Айжан позвонила папе?',opts:['Автобус не пришёл.','В школе не было уроков.','Она потеряла телефон.'],a:0,why:'Мәтіндегі «автобус не пришёл» деген себепке сүйеніп жауап береміз.',difficulty:3},
  {tag:'Правописание',q:'Қай сөйлемде тыныс белгісі дұрыс қойылған?',opts:['Я знаю, что ты хорошо подготовился.','Я знаю что, ты хорошо подготовился.','Я, знаю что ты хорошо подготовился.'],a:0,why:'Бағыныңқы сөйлемді «что» жалғаулығы бастайды. Үтір сол жалғаулықтың алдына қойылады.',difficulty:3},
  {tag:'Порядок слов',q:'Какое предложение передаёт смысл «Вчера Алия сходила в библиотеку и взяла новую книгу»?',opts:['Вчера Алия пошла в библиотеку и взяла новую книгу.','Алия новую вчера библиотеку книгу взяла.','В библиотеку книга взяла вчера новую Алия.'],a:0,why:'Орысша сөйлемде сөздердің орны өзгеруі мүмкін, бірақ бастауыш пен баяндауыштың байланысы және сөздердің септік тұлғасы сақталуы керек.',difficulty:3},
  {tag:'Словарь',q:'Он достиг своей цели, несмотря на трудности. Что означает «несмотря на трудности»?',opts:['Несмотря на препятствия','О трудностях','Вместо трудностей'],a:0,why:'«Несмотря на» тіркесі кедергіге қарамастан әрекеттің болғанын білдіреді.',difficulty:3},
];
const extraQuiz:DiagnosticQuestion[]=extraDiagnostic.filter(q=>!q.q.startsWith('Ученик прочитал')).map((q,i)=>({...q,difficulty:(i<8?1:2) as Difficulty}));
const adaptiveBank:DiagnosticQuestion[]=[...extraQuiz,...advancedQuestions];
const legacyQuiz=[...coreQuiz,...extraQuiz];
type Props={d:State;set:(f:(d:State)=>State)=>void;record:(tag:string,correct:boolean,xp?:number,wrong?:string,answer?:string,explanation?:string)=>void};
const topicOf=(tag:string)=>{const parts=tag.split(' · ');return parts[parts.length-1].toLocaleLowerCase()};

function chooseAdaptiveQuestions(answers:Record<number,number>):DiagnosticQuestion[]{
  const correct=coreQuiz.reduce((n,q,i)=>n+(answers[i]===q.a?1:0),0);
  const target:Difficulty=correct<5?1:correct<8?2:3;
  const topicScores=new Map<string,{correct:number;total:number}>();
  coreQuiz.forEach((q,i)=>{const topic=topicOf(q.tag),score=topicScores.get(topic)||{correct:0,total:0};score.total++;if(answers[i]===q.a)score.correct++;topicScores.set(topic,score)});
  const used=new Set<string>(),picked:DiagnosticQuestion[]=[];
  while(picked.length<5){
    const candidates=adaptiveBank.filter(q=>!used.has(q.q));
    candidates.sort((a,b)=>{
      const aTopic=topicScores.get(topicOf(a.tag)),bTopic=topicScores.get(topicOf(b.tag));
      const aWeak=aTopic?aTopic.correct/aTopic.total:0.5,bWeak=bTopic?bTopic.correct/bTopic.total:0.5;
      const aDistance=Math.abs(a.difficulty-target),bDistance=Math.abs(b.difficulty-target);
      return aDistance-bDistance||aWeak-bWeak;
    });
    const next=candidates[0];if(!next)break;
    picked.push(next);used.add(next.q);
    const key=topicOf(next.tag),score=topicScores.get(key)||{correct:0,total:0};score.total++;topicScores.set(key,score);
  }
  return picked;
}

export default function Quiz({d,set,record}:Props){
  const[index,I]=useState(0),[answers,A]=useState<Record<number,number>>({}),[error,E]=useState(''),[result,R]=useState<DiagnosticRun|null>(null),[busy,B]=useState(false),[started,Started]=useState(false),[session,S]=useState<DiagnosticQuestion[]>(coreQuiz);
  const q=session[index],answered=answers[index]!==undefined,isCorrect=answers[index]===q?.a,previous=d.diagnosticRuns[d.diagnosticRuns.length-1];
  function start(){I(0);A({});E('');R(null);S(coreQuiz);Started(true)}
  function advance(){
    if(index===coreQuiz.length-1&&session.length===coreQuiz.length){
      const next=chooseAdaptiveQuestions(answers);S([...session,...next]);I(index+1);E('');return;
    }
    I(index+1);E('');R(null);
  }
  function finish(){
    if(busy)return;
    const missing=session.map((_,i)=>i).filter(i=>answers[i]===undefined);
    if(missing.length){E(`Жауапсыз ${missing.length} сұрақ бар. Алдымен оларды толтырыңыз.`);I(missing[0]);return}
    B(true);
    const correct=session.reduce((n,item,i)=>n+(answers[i]===item.a?1:0),0),baselineScore=coreQuiz.reduce((n,item,i)=>n+(answers[i]===item.a?1:0),0),byTopic=new Map<string,{correct:number;total:number}>();
    session.forEach((item,i)=>{const parts=item.tag.split(' · '),topic=parts[parts.length-1]||item.tag,x=byTopic.get(topic)||{correct:0,total:0};x.total++;if(answers[i]===item.a)x.correct++;record(item.tag,answers[i]===item.a,undefined,item.opts[answers[i]],item.opts[item.a],item.why);byTopic.set(topic,x)});
    const run:DiagnosticRun={score:correct,total:session.length,baselineScore,baselineTotal:coreQuiz.length,date:new Date().toLocaleDateString('kk-KZ'),answers:session.map((_,i)=>answers[i]),byTopic:[...byTopic.entries()].map(([topic,x])=>({topic,...x})),questionSet:session.map(({tag,q,opts,a,why,difficulty})=>({tag,q,opts,a,why,difficulty}))};
    set(old=>({...old,diagnosed:true,diagnosticScore:Math.round(baselineScore/coreQuiz.length*100),diagnosticRuns:[...old.diagnosticRuns,run]}));R(run);E('');B(false);
  }
  if(result){
    const pct=Math.round(result.score/result.total*100),placement=Math.round((result.baselineScore??result.score)/(result.baselineTotal??result.total)*100),reviewItems=result.questionSet||legacyQuiz;
    const weak=result.byTopic.filter(x=>x.correct<x.total).sort((a,b)=>(a.correct/a.total)-(b.correct/b.total));
    return <><header className="pagehead"><div><div className="eyebrow">ДИАГНОСТИКА · НӘТИЖЕ</div><h1>Тест нәтижесі</h1><p>{result.date} · Деңгей бастапқы 10 сұрақ бойынша бағаланды; бұл ресми сертификат емес.</p></div><button className="outline" onClick={start}>Қайта тапсыру</button></header>
      <div className="stats"><div className="stat"><div className="statlabel">Дұрыс жауап</div><div className="statvalue">{result.score} / {result.total}</div></div><div className="stat"><div className="statlabel">Қате жауап</div><div className="statvalue">{result.total-result.score}</div></div><div className="stat"><div className="statlabel">Барлық сұрақ</div><div className="statvalue">{pct}%</div></div><div className="stat"><div className="statlabel">Бағдарлы деңгей</div><div className="statvalue">{placement>=88?'B2':placement>=72?'B1':placement>=50?'A2':'A1'}</div></div></div>
      <section className="panel"><h3>Қайталау ұсынысы</h3>{weak.length?<p className="mutedtext">Алдымен {weak.slice(0,3).map(x=>x.topic).join(', ')} тақырыптарын қайтала. Келесі оқу тапсырмалары осы дағдыларға қарай іріктеледі.</p>:<p className="mutedtext">Бастапқы сұрақтарға бәрін дұрыс орындадың. Саған күрделірек жаттығулар ұсынылады.</p>}{result.byTopic.map(x=><div className="skill" key={x.topic}><div className="skill-top"><b>{x.topic}</b><strong>{x.correct}/{x.total}</strong></div><div className="bar"><span style={{width:Math.round(x.correct/x.total*100)+'%'}}/></div></div>)}</section>
      <section className="panel"><h3>Жауаптарды тексеру</h3>{reviewItems.map((item,i)=>{const ok=result.answers[i]===item.a;return <article className="quiz-review" key={`${i}-${item.q}`}><div className="quiz-review-top"><b>{i+1}. {item.q}</b><span className={ok?'goodtext':'badtext'}>{ok?'Дұрыс':'Қайталау'}</span></div><p>Сенің жауабың: <b>{item.opts[result.answers[i]]}</b> · Дұрыс жауап: <b>{item.opts[item.a]}</b></p>{!ok&&<small>{item.why||explanationFor(item.tag)}</small>}</article>})}</section>
      {previous&&d.diagnosticRuns.length>1&&<p className="mutedtext">Алдыңғы тест: {previous.score}/{previous.total}, {previous.date}</p>}
    </>;
  }
  if(!started)return <><header className="pagehead"><div><div className="eyebrow">БАСТАПҚЫ БАҒАЛАУ</div><h1>Өз деңгейіңді анықта</h1><p>10 бастапқы сұрақ және нәтижеге қарай іріктелетін 5 қосымша сұрақ.</p></div></header>
    {previous&&<div className="panel previous-run"><b>Соңғы нәтиже: {previous.score}/{previous.total}</b><span>{previous.date}</span><button className="outline" onClick={()=>R(previous)}>Нәтижені көру</button></div>}
    <section className="panel intro"><div className="bigicon">◈</div><h2>Бейімделетін диагностикалық тест</h2><p>Алғашқы 10 жауаптан кейін келесі сұрақтар сенің деңгейің мен қиналған тақырыптарыңа қарай таңдалады.</p><div className="intro-meta"><span>◷ Шамамен 10 минут</span><span>✦ Оңай, орташа немесе күрделі жалғасы</span></div><button className="primary wide" onClick={start}>Тестті бастау →</button></section>
  </>;
  const pct=(index+1)/15*100,baselinePhase=index<coreQuiz.length;
  return <><header className="pagehead"><div><div className="eyebrow">{baselinePhase?'1-КЕЗЕҢ · БАСТАПҚЫ ДЕҢГЕЙ':'2-КЕЗЕҢ · ЖЕКЕ ІРІКТЕЛГЕН'}</div><h1>Өз деңгейіңді анықта</h1><p>{baselinePhase?'Алғашқы жауаптарың келесі тапсырмаларды таңдауға көмектеседі.':'Қосымша тапсырмалар нәтижеңе қарай таңдалды.'}</p></div><span className="pill">{index+1} / 15</span></header>
    <section className="panel quiz"><div className="progress"><i style={{width:pct+'%'}}/></div><h2>{q.q}</h2><div className="options">{q.opts.map((option,j)=><button key={`${index}-${option}`} aria-pressed={answers[index]===j} className={'option '+(answered&&j===q.a?'answer-correct':answered&&answers[index]===j&&answers[index]!==q.a?'answer-wrong':answers[index]===j?'chosen':'')} onClick={()=>{A(old=>({...old,[index]:j}));E('')}}><span>{String.fromCharCode(65+j)}</span>{option}</button>)}</div>
      {answered&&<div className={'practice-feedback '+(isCorrect?'is-correct':'is-wrong')} role="status"><b>{isCorrect?'Дұрыс! Керемет! ✨':'Қате — қайта байқап көрейік.'}</b><p>{q.why}</p></div>}{error&&<div className="feedback no" role="alert">{error}</div>}
      <div className="quiz-controls"><button className="outline" disabled={index===0||busy} onClick={()=>{I(index-1);E('');R(null)}}>← Артқа</button><span className="mutedtext">{Object.keys(answers).length}/{session.length} жауап таңдалды</span>{index<session.length-1?<button className="primary" disabled={busy} onClick={advance}>{index===coreQuiz.length-1?'Нәтижеме сай жалғастыру →':'Келесі сұрақ →'}</button>:<button className="primary" disabled={busy} onClick={finish}>{busy?'Тексерілуде…':'Тестті аяқтау ✓'}</button>}</div>
      {index===session.length-1&&<button className="textbtn" disabled={busy} onClick={finish}>Жауаптарды тексеріп, нәтижені шығару</button>}
    </section>
  </>;
}
