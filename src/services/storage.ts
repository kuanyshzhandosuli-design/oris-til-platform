import type {State} from '../types';

export const STORAGE_KEY='tilpro-v1';
export const initialState:State={role:'student',name:'',grade:'',records:[],known:[],favorites:[],xp:0,streak:0,last:'',diagnosed:false,diagnosticScore:null,diagnosticRuns:[],dictations:[],assignments:[],errors:[],weeklyResults:[],goal:3,authenticated:false,email:'',notifications:[],classes:[]};

export class ApiError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
export async function apiRequest<T=any>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(path,{...init,credentials:'include',headers:{...(init.body?{'content-type':'application/json'}:{}),...init.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(response.status,data.error||`Сервер қатесі (${response.status}).`);
  return data as T;
}
export async function loadState():Promise<State>{const data=await apiRequest<{state:Partial<State>}>('/api/state');return {...initialState,...data.state}}
export async function saveState(value:State):Promise<void>{const{accounts,teacherStudents,assignments,...state}=value;void accounts;void teacherStudents;void assignments;await apiRequest('/api/state',{method:'PUT',body:JSON.stringify({state})})}

