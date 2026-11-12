import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import { CheckCircledIcon, ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import './FeedbackToast.css';

import {feedbackKind, feedbackDuration} from './feedbackPolicy.mjs';

// The shell provides a revision so repeated identical events restart the timer.
export default function FeedbackToast({message, revision, onDismiss}) {
  const [position,setPosition]=useState(null),dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;
  useLayoutEffect(()=>{
    if(!message)return;
    const toolbar=document.querySelector('.toolbar');
    const content=document.querySelector('[data-workspace-pane="content"]');
    const update=()=>{
      const bar=toolbar?.getBoundingClientRect(),pane=content?.getBoundingClientRect();
      setPosition({top:(bar?.bottom??0)+12,left:pane?pane.left+pane.width/2:window.innerWidth/2});
    };
    update();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);
    if(toolbar)observer?.observe(toolbar);if(content)observer?.observe(content);
    window.addEventListener('resize',update);
    return()=>{observer?.disconnect();window.removeEventListener('resize',update)};
  },[Boolean(message)]);
  useEffect(()=>{
    if(!message)return;
    const duration=feedbackDuration(message);
    const timer=setTimeout(()=>dismissRef.current?.(),duration);
    return()=>clearTimeout(timer);
  },[message,revision]);
  if(!message)return null;
  const kind=feedbackKind(message),Icon=kind==='success'?CheckCircledIcon:kind==='error'?ExclamationTriangleIcon:InfoCircledIcon;
  return <div className={`feedback-toast feedback-toast-${kind}`} role="status" aria-live="polite" style={position||undefined}>
    <Icon className="feedback-toast-icon" aria-hidden="true"/><span>{message}</span>
  </div>;
}
