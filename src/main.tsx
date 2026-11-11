import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,HashRouter} from 'react-router-dom';
import App from './App';
import './style.css';

function AppRouter(){
  return location.protocol==='file:'
    ? <HashRouter><App/></HashRouter>
    : <BrowserRouter basename={import.meta.env.BASE_URL}><App/></BrowserRouter>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppRouter/></React.StrictMode>);

