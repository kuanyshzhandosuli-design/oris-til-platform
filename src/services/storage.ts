import type {State} from '../types';

export const STORAGE_KEY='tilpro-v1';
const SESSION_TOKEN_KEY='tilpro-session-token';
const API_BASE=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/+$/,'');
export const initialState:State={role:'student',name:'',grade:'',records:[],known:[],favorites:[],xp:0,streak:0,last:'',diagnosed:false,diagnosticScore:null,diagnosticRuns:[],dictations:[],assignments:[],errors:[],weeklyResults:[],goal:3,authenticated:false,email:'',notifications:[],classes:[]};

export class ApiError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
export async function apiRequest<T=any>(path:string,init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers);
  if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const token=typeof window!=='undefined'?window.sessionStorage.getItem(SESSION_TOKEN_KEY):null;
  if(token&&!headers.has('authorization'))headers.set('authorization',`Bearer ${token}`);
  const response=await fetch(`${API_BASE}${path}`,{...init,credentials:'include',headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(response.status,data.error||`Сервер қатесі (${response.status}).`);
  if(typeof data.sessionToken==='string')window.sessionStorage.setItem(SESSION_TOKEN_KEY,data.sessionToken);
  if(path==='/api/auth/logout')window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  return data as T;
}
export async function loadState():Promise<State>{const data=await apiRequest<{state:Partial<State>}>('/api/state');return {...initialState,...data.state}}
export async function saveState(value:State):Promise<void>{const{accounts,teacherStudents,assignments,...state}=value;void accounts;void teacherStudents;void assignments;await apiRequest('/api/state',{method:'PUT',body:JSON.stringify({state})})}
