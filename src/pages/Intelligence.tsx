import type {State} from '../types';

type Props={d:State;go:(page:string)=>void};

export function IntelligenceEvidence({d,go}:Props){
  const runs=d.diagnosticRuns||[];
  const first=runs[0], latest=runs[runs.length-1];
  const before=new Map((first?.byTopic||[]).map(x=>[x.topic,Math.round(x.correct/Math.max(x.total,1)*100)]));
  const comparisons=(runs.length>1?(latest?.byTopic||[]):[]).filter(x=>before.has(x.topic)).map(x=>({topic:x.topic,old:before.get(x.topic)!,now:Math.round(x.correct/Math.max(x.total,1)*100)}));
  const openErrors=d.errors.filter(x=>!x.fixed);
  const counts=new Map<string,number>();
  openErrors.forEach(x=>counts.set(x.topic,(counts.get(x.topic)||0)+x.repeats));
  const focus=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const plan=[
    {day:'Дүйсенбі',title:focus?`${focus}: қатені қайта қарап, себебін түсін`:'Диагностикалық тест тапсырып, әлсіз тақырыпты анықта',page:focus?'mistakes':'diagnostic',done:focus?false:d.diagnosed},
    {day:'Сейсенбі',title:focus?`${focus} бойынша қысқа жаттығу орында`:'Грамматика жаттығуын орында',page:'grammar',done:false},
    {day:'Сәрсенбі',title:'Жаңа сөздерді сөйлем ішінде қолдан',page:'vocab',done:d.known.length>0},
    {day:'Бейсенбі',title:'Орысша жауап беріп, сөйлеуді жаттықтыр',page:'speaking',done:d.records.some(x=>x.tag.startsWith('Сөйлеу'))},
    {day:'Жұма',title:'Қайталап диагностика тапсырып, өсімді салыстыр',page:'diagnostic',done:runs.length>1}
  ];
  return <>
    <section className="panel intelligence-panel">
      <div className="panelhead"><div><h3>TilPro Intelligence · біліміңнің өзгерісі</h3><p>Бірінші және соңғы диагностиканың тақырыптық нәтижелері</p></div><span className="pill">{runs.length} диагностика</span></div>
      {comparisons.length>0?<div className="grid2">{comparisons.map(x=><article className="growth-card" key={x.topic}><div className="skill-top"><b>{x.topic}</b><strong>{x.old}% → {x.now}%</strong></div><div className="bar"><span style={{width:`${x.now}%`}}/></div><small className={x.now>x.old?'goodtext':x.now<x.old?'badtext':'mutedtext'}>{x.now>x.old?`+${x.now-x.old} пайыздық тармақ өсім`:x.now<x.old?`${x.now-x.old} пайыздық тармақ өзгеріс`:'Нәтиже өзгермеген'}</small></article>)}</div>:<div className="empty">Өсімді дәлелдеу үшін диагностиканы кемінде екі рет тапсырыңыз. TilPro әр тақырыпты бөлек салыстырады.</div>}
    </section>
    <section className="panel intelligence-panel">
      <div className="panelhead"><div><h3>Жеке апталық оқу маршруты</h3><p>{focus?`Жоспар ашық қателеріңдегі ең жиі тақырыпқа басымдық береді: ${focus}.`:'Қате тарихың әзірге жоқ. Диагностикадан кейін жоспар жеке жаңарады.'}</p></div><button className="link" onClick={()=>go('route')}>Маршрутты ашу →</button></div>
      {plan.map((x,i)=><div className="routerow" key={x.day}><div className={'routecheck '+(x.done?'done':'')}>{x.done?'✓':i+1}</div><div className="routeday">{x.day}<small>{x.done?'Орындалды':'Ұсынылған қадам'}</small></div><b>{x.title}</b><button className="outline" onClick={()=>go(x.page)}>Бастау →</button></div>)}
    </section>
  </>;
}

