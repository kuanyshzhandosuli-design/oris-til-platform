import{useEffect,useState}from'react';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

export default function InstallApp(){
  const[prompt,setPrompt]=useState<InstallPrompt|null>(null);
  useEffect(()=>{
    const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt)};
    const installed=()=>setPrompt(null);
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',installed);
    return()=>{window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',installed)};
  },[]);
  if(!prompt)return null;
  async function install(){const current=prompt;if(!current)return;await current.prompt();await current.userChoice;setPrompt(null)}
  return <button className="install-app" type="button" onClick={install}>＋ Қосымша ретінде орнату</button>;
}
