import{useMemo,useState}from'react';
import type{State,ErrorEntry}from'../types';
import{weeklyDays}from'../data/weekly';

type Props={d:State;set:(f:(d:State)=>State)=>void;record:(tag:string,correct:boolean,xp?:number,wrong?:string,answer?:string,explanation?:string,source?:string,weekDay?:string)=>void};
type Filter='due'|'open'|'fixed'|'all';
const fallback=[{prompt:'«Я вижу кот» сөйлеміндегі сөзді дұрыс таңда.',options:['Я вижу кота','Я вижу коту','Я вижу котом'],answer:0,why:'«Вижу кого?» сұрағына табыс септігі керек: «вижу кота».'},{prompt:'Сөздерді дұрыс ретке келтір.',options:['Собака играет во дворе.','Играет дворе собака в.','Во собака играет дворе.'],answer:0,why:'Сөйлемде бастауыш пен баяндауыштың байланысын сақта.'}];
const dayMs=24*60*60*1000;
function isDue(e:ErrorEntry,now=Date.now()){return !e.nextReviewAt||Date.parse(e.nextReviewAt)<=now}
function reviewDate(e:ErrorEntry){if(!e.nextReviewAt||isDue(e))return'Қазір қайталау';return`Қайталау: ${new Date(e.nextReviewAt).toLocaleDateString('kk-KZ',{day:'numeric',month:'short'})}`}
function pickTask(e:ErrorEntry,step:number){const day=weeklyDays.find(x=>x.weekday===e.weekDay),tasks=day?.errors||fallback;if(step===0)return{prompt:'Алғашқы қатені түзет: '+e.wrong,options:[e.answer,e.wrong],answer:0,why:e.explanation};return tasks[(step-1)%tasks.length]}

export default function ErrorWork({d,set,record}:Props){
  const[filter,F]=useState<Filter>('due'),[search,S]=useState(''),[topic,T]=useState('Барлық тақырып'),[active,A]=useState<string|null>(null),[choice,C]=useState<number|null>(null),[message,M]=useState('');
  const errors=d.errors||[],topics=[...new Set(errors.map(e=>e.weekDay||e.topic))],now=Date.now(),dueCount=errors.filter(e=>!e.fixed&&isDue(e,now)).length,total=errors.length,mastered=errors.filter(e=>e.fixed).length,open=total-mastered;
  const categories=Object.entries(errors.reduce<Record<string,number>>((a,e)=>(a[e.category]=(a[e.category]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
  const topicsTop=Object.entries(errors.reduce<Record<string,number>>((a,e)=>(a[e.weekDay||e.topic]=(a[e.weekDay||e.topic]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
  const shown=useMemo(()=>errors.filter(e=>{
    const status=filter==='all'||(filter==='open'&&!e.fixed)||(filter==='fixed'&&e.fixed)||(filter==='due'&&!e.fixed&&isDue(e));
    return status&&(topic==='Барлық тақырып'||(e.weekDay||e.topic)===topic)&&(!search||`${e.wrong} ${e.answer} ${e.topic} ${e.explanation}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  }).sort((a,b)=>Number(a.fixed)-Number(b.fixed)||Number(isDue(b))-Number(isDue(a))||b.repeats-a.repeats),[errors,filter,topic,search]);
  function begin(e:ErrorEntry){A(e.id);C(null);M('');set(x=>({...x,errors:x.errors.map(y=>y.id===e.id?{...y,acknowledged:true}:y)}))}
  function submit(e:ErrorEntry,selected:number){
    const step=e.mastery||0,q=pickTask(e,step),correct=selected===q.answer,reviewedAt=new Date(),nextMastery=correct?Math.min(3,step+1):0,fixed=correct&&nextMastery>=3;
    C(selected);M(correct?'Дұрыс! Ережеңді бекіттің.':'Қайта байқап көр.');
    record(e.topic,correct,correct?12:2,correct?undefined:e.wrong,e.answer,q.why,e.source||'Қатемен жұмыс',e.weekDay);
    set(x=>({...x,errors:x.errors.map(y=>{
      if(y.id!==e.id&&!( !correct&&y.topic===e.topic&&y.wrong===e.wrong))return y;
      const nextReviewAt=fixed?undefined:correct?new Date(reviewedAt.getTime()+(nextMastery===1?1:3)*dayMs).toISOString():reviewedAt.toISOString();
      return{...y,mastery:nextMastery,fixed,lastAttemptCorrect:correct,acknowledged:true,reviewStage:nextMastery,nextReviewAt,lastReviewedAt:reviewedAt.toISOString()};
    })}));
    if(fixed){M('Жарайсың! Қате үш аралық жаттығудан кейін түзетілді! ✨');A(null);C(null)}
  }
  return <>
    <header className="pagehead"><div><div className="eyebrow">ҚАТЕНІ ТҮЗЕТУ МОДУЛІ</div><h1>Қатемен жұмыс</h1><p>Қатені бүгін түзетіп қана қоймай, жоспарлы аралықпен қайта тексер.</p></div></header>
    <div className="stats"><Stat label="Жалпы қате" value={total}/><Stat label="Түзетілген" value={mastered}/><Stat label="Ашық қате" value={open}/><Stat label="Қайталау керек" value={dueCount}/></div>
    <div className="grid2"><section className="panel"><h3>Қай тақырыпта қиындық бар?</h3>{topicsTop.length?topicsTop.slice(0,4).map(([name,n])=><div className="skill" key={name}><div className="skill-top"><b>{name}</b><strong>{n} қате</strong></div><div className="bar"><span style={{width:Math.round(n/Math.max(total,1)*100)+'%'}}/></div></div>):<p className="empty">Қате тіркелген сайын тақырып статистикасы жаңарады.</p>}</section>
      <section className="panel"><h3>Жеке ұсыныс</h3><p>{total===0?'Тапсырма орындағанда қате карточкалары осында жиналады.':dueCount?`Бүгін ${dueCount} қатені қайталау керек. Алдымен ${topicsTop[0]?.[0]||'ашық қателер'} тақырыбынан баста.`:categories[0]?.[0]==='Грамматикалық'?'Грамматиканы пысықта. Келесі қайталау мерзімі карточкада көрсетіледі.':'Бәрі уақытында қайталанып жатыр. Жаңа тапсырмаларды орындауды жалғастыр.'}</p></section></div>
    <section className="panel error-work-list"><div className="panelhead"><div><h3>Жеке жаттығулар</h3><p>Дұрыс жауаптан кейін келесі қайталау мерзімі автоматты белгіленеді.</p></div></div>
      <div className="table-controls"><div className="tabs"><button className={filter==='due'?'selected':''} onClick={()=>F('due')}>Қайталау керек ({dueCount})</button><button className={filter==='open'?'selected':''} onClick={()=>F('open')}>Меңгерілмеген ({open})</button><button className={filter==='fixed'?'selected':''} onClick={()=>F('fixed')}>Түзетілген ({mastered})</button><button className={filter==='all'?'selected':''} onClick={()=>F('all')}>Барлығы</button></div><input className="search" placeholder="Қате, жауап не тақырып іздеу…" value={search} onChange={e=>S(e.target.value)}/><select value={topic} onChange={e=>T(e.target.value)}><option>Барлық тақырып</option>{topics.map(x=><option key={x}>{x}</option>)}</select></div>
      {shown.length?shown.map(e=>{const task=pickTask(e,e.mastery||0),due=isDue(e,now);return <article className="error-work-card" key={e.id}>
        <div className="error-work-top"><div><span className="weakpill">{e.category}</span> <span className="pill">{e.weekDay||e.topic}</span> <span className={e.fixed?'status-done':'statusopen'}>{e.fixed?'Түзетілді':`Меңгеру ${e.mastery||0}/3`}</span></div><small>{e.date} · {e.repeats} рет · {e.source||'Тапсырма'}</small></div>
        <div className="errorcompare"><div className="error-original"><small>ОҚУШЫНЫҢ ЖАУАБЫ</small><b>{e.wrong}</b></div><span>→</span><div className="error-correct"><small>ДҰРЫС НҰСҚА</small><b>{e.answer}</b></div></div><p>{e.explanation}</p>
        {!e.fixed&&<div className="review-schedule"><span>{due?'🟠 Бүгін қайталау':`🗓 ${reviewDate(e)}`}</span><small>{e.lastReviewedAt?`Соңғы жаттығу: ${new Date(e.lastReviewedAt).toLocaleDateString('kk-KZ')}`:'Алғашқы қайталау'}</small></div>}
        {!e.fixed&&(active!==e.id?<button className="primary" onClick={()=>begin(e)}>{due?(e.acknowledged?'Қайта жаттықтыру':'Қатені түсіндім · Жаттығу'):`Ерте қайталау · ${reviewDate(e)}`}</button>:<div className="error-exercise"><div className="eyebrow">{(e.mastery||0)+1}-ҚАДАМ · АРАЛЫҚПЕН ҚАЙТАЛАУ</div><h4>{task.prompt}</h4><div className="options">{task.options.map((x,i)=><button className={'option '+(choice!==null&&i===task.answer?'answer-correct':choice===i&&message.startsWith('Қайта')?'answer-wrong':'')} disabled={choice!==null} onClick={()=>submit(e,i)} key={i}><span>{String.fromCharCode(65+i)}</span>{x}</button>)}</div>{message&&<div className={'practice-feedback '+(message.startsWith('Дұрыс!')||message.startsWith('Жарайсың!')?'is-correct':'is-wrong')} role="status"><b>{message.startsWith('Қайта')?'Қате жауап — түсіндірмені оқып, тағы байқап көр.':message.split('. ')[0]}</b><p>{task.why}</p></div>}<div className="quiz-controls">{choice!==null&&<button className="outline" onClick={()=>{C(null);M('')}}>Келесі ұқсас жаттығу →</button>}<button className="link" onClick={()=>{A(null);C(null);M('')}}>Жабу</button></div></div>)}
      </article>}):<div className="empty">{filter==='due'?'Қазір қайталайтын қате жоқ. Келесі жоспарлы қайталауды карточкалардан көре аласың.':total?'Бұл сүзгіге сай қате жоқ.':'Әзірге қате тіркелмеген. Апталық бағдарламадағы тапсырмаларды орындап көр.'}</div>}
    </section>
  </>;
}

function Stat({label,value}:{label:string;value:string|number}){return <div className="stat"><div className="statlabel">{label}</div><div className="statvalue">{value}</div><div className="statsub">Нақты сақталған нәтижелер</div></div>}
