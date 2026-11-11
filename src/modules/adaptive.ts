import type {State} from '../types';

export type Skill='vocab'|'grammar'|'error'|'dictation'|'speaking'|'reading'|'test';
const patterns:Record<Skill,RegExp>={
  vocab:/словар|сөздік|лексик|vocab/i,
  grammar:/граммат|падеж|септ|род|прилаг|согласован|глагол|времен|спряж|предлог/i,
  error:/қат|ошиб|исправ|error/i,
  dictation:/диктант|орфограф|правопис|жазылым/i,
  speaking:/сөйле|сөйлесу|разговор|говор|предложени|сөйлем|порядок слов/i,
  reading:/чтени|оқылым|reading/i,
  test:/тест|итогов|қорытынды/i
};
const title:Record<Skill,string>={vocab:'Сөздік қор',grammar:'Грамматика',error:'Қатені түзету',dictation:'Диктант',speaking:'Сөйлесу',reading:'Оқу және түсіну',test:'Қорытынды тест'};
function matches(tag:string,skill:Skill){return patterns[skill].test(tag)}

/** Scores use actual last diagnostic evidence and recent saved answers, never demo student rows. */
export function skillScore(d:State,skill:Skill):number|null{
  const diagnostic=d.diagnosticRuns?.[d.diagnosticRuns.length-1];
  const diagnosticRows=(diagnostic?.byTopic||[]).filter(x=>matches(x.topic,skill));
  const diagTotal=diagnosticRows.reduce((n,x)=>n+x.total,0);
  const diag=diagTotal?Math.round(diagnosticRows.reduce((n,x)=>n+x.correct,0)/diagTotal*100):null;
  const recent=(d.records||[]).filter(x=>matches(`${x.tag} ${x.source||''}`,skill)).slice(-20);
  const live=recent.length>=3?Math.round(recent.filter(x=>x.correct).length/recent.length*100):null;
  if(live===null)return diag;
  return diag===null?live:Math.round(diag*.35+live*.65);
}

export function learnerLevel(d:State):'A1'|'A2'|'B1'|'B2'|null{
  const latest=d.diagnosticRuns?.[d.diagnosticRuns.length-1];
  const score=latest?.baselineScore??latest?.score;
  const total=latest?.baselineTotal??latest?.total;
  if(!d.diagnosed||!total)return null;
  const pct=score!/total*100;
  return pct>=88?'B2':pct>=72?'B1':pct>=50?'A2':'A1';
}

export function skillLabel(skill:Skill){return title[skill]}

/** Keep each day on its shared theme while changing amount and challenge by demonstrated mastery. */
export function adaptiveItems<T>(items:T[],d:State,skill:Skill):T[]{
  if(items.length<=1)return items;
  const score=skillScore(d,skill);
  if(score===null)return items;
  const count=score<55?items.length:score<80?Math.max(4,Math.ceil(items.length*.75)):Math.max(3,Math.ceil(items.length*.6));
  if(count>=items.length)return items;
  // Content is ordered from foundational to more demanding examples.
  if(score<55)return items.slice(0,count);
  if(score>=80)return items.slice(items.length-count);
  const chosen:T[]=[];
  for(let i=0;i<count;i++)chosen.push(items[Math.round(i*(items.length-1)/(count-1))]);
  return chosen;
}

export function learnerProfile(d:State){
  const skills:Skill[]=['vocab','grammar','error','dictation','speaking','reading','test'];
  const scored=skills.map(skill=>({skill,label:skillLabel(skill),score:skillScore(d,skill)})).filter(x=>x.score!==null) as {skill:Skill;label:string;score:number}[];
  const weak=scored.filter(x=>x.score<70).sort((a,b)=>a.score-b.score).slice(0,2),strong=scored.filter(x=>x.score>=80).sort((a,b)=>b.score-a.score).slice(0,2);return {level:learnerLevel(d),scored,weak,strong,next:weak[0]||scored.filter(x=>x.score<80).sort((a,b)=>a.score-b.score)[0]||scored.sort((a,b)=>a.score-b.score)[0]||null};
}
