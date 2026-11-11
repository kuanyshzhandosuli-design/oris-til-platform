import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,HashRouter} from 'react-router-dom';
import App from './App';
import InstallApp from './components/InstallApp';
import './style.css';

function AppRouter(){
  React.useEffect(()=>{
    if(import.meta.env.PROD&&'serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL}).catch(()=>{});
  },[]);
  return location.protocol==='file:'
    ? <HashRouter><App/><InstallApp/></HashRouter>
    : <BrowserRouter basename={import.meta.env.BASE_URL}><App/><InstallApp/></BrowserRouter>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppRouter/></React.StrictMode>);
