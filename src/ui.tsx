import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { inputMoney, parseMoney } from '../shared/model.ts';
export type Mode='real'|'demo';
export async function request<T>(path:string,mode:Mode,body?:unknown):Promise<T> {
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-TVA-Client':'1','X-TVA-Mode':mode},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error??'Le serveur local ne répond pas.');
  return result as T;
}
export const errorText=(e:unknown)=>e instanceof Error?e.message:'Une erreur est survenue.';
export function Modal({title,children,onClose,wide=false,canClose=true}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;canClose?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return ()=>dialog?.close();},[]);
  return <dialog ref={ref} className={wide?'modal wide':'modal'} onCancel={e=>{e.preventDefault();if(canClose)onClose();}}>
    <header className="modal-head"><h2>{title}</h2><button aria-label="Fermer la fenêtre" className="icon" disabled={!canClose} onClick={onClose}>×</button></header>{children}
  </dialog>;
}
export function MoneyInput({value,onChange,label,nullable=false,min,max}:{value:number|null;onChange:(n:number|null)=>void;label:string;nullable?:boolean;min?:number;max?:number}) {
  const [text,setText]=useState(value===null?'':inputMoney(value));
  const committed=useRef(value);
  useEffect(()=>{if(value!==committed.current){setText(value===null?'':inputMoney(value));committed.current=value;}},[value]);
  function parse(text:string) {const n=nullable&&text.trim()===''?null:parseMoney(text);if(n!==null&&(min!==undefined&&n<min||max!==undefined&&n>max))throw new Error('Pourcentage attendu entre 0 et 100.');return n;}
  return <input aria-label={label} inputMode="decimal" value={text} required={!nullable} onChange={e=>{
    const text=e.target.value;setText(text);
    try {const value=parse(text);committed.current=value;onChange(value);e.target.setCustomValidity('');}
    catch(e2) {e.target.setCustomValidity(errorText(e2));}
  }} onBlur={e=>{
    try {const value=parse(text);setText(value===null?'':inputMoney(value));committed.current=value;onChange(value);e.target.setCustomValidity('');}
    catch(e2) {e.target.setCustomValidity(errorText(e2));}
  }}/>;
}
