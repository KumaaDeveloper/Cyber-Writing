import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act, createElement as h } from "react";

test("password is visible only while holding the eye and is masked on release, cancellation or focus loss", async () => {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:"https://cywrite.test",pretendToBeVisual:true});
  const w=dom.window;
  for(const key of ["window","document","navigator","Node","Element","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent"])
    Object.defineProperty(globalThis,key,{value:key==="window"?w:(w as any)[key],configurable:true,writable:true});
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=await import("react-dom/client");
  const {PasswordInput}=await import("../components/password-input");
  const root=createRoot(w.document.getElementById("root")!);
  let submitted=0, registered:HTMLInputElement|null=null;
  await act(async()=>root.render(h("form",{onSubmit:(e:React.FormEvent)=>{e.preventDefault();submitted++;}},h(PasswordInput,{defaultValue:"fixture-password",name:"password",ref:(input)=>{registered=input;}}))));
  const input=w.document.querySelector("input")!, button=w.document.querySelector("button")!;
  assert.equal(registered,input);assert.equal(input.type,"password");
  const pointer=async(type:string,target:EventTarget=button)=>{await act(async()=>target.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0})));};
  try {
    await pointer("pointerdown");assert.equal(input.type,"text");
    await pointer("pointerup",w);assert.equal(input.type,"password");
    await pointer("pointerdown");await pointer("pointercancel",w);assert.equal(input.type,"password");
    await pointer("pointerdown");await act(async()=>w.dispatchEvent(new w.Event("blur")));assert.equal(input.type,"password");
    await pointer("pointerdown");await act(async()=>w.document.dispatchEvent(new w.Event("visibilitychange")));assert.equal(input.type,"password");
    await act(async()=>button.dispatchEvent(new w.KeyboardEvent("keydown",{key:" ",bubbles:true,cancelable:true})));assert.equal(input.type,"text");
    await act(async()=>button.dispatchEvent(new w.KeyboardEvent("keyup",{key:" ",bubbles:true,cancelable:true})));assert.equal(input.type,"password");
    await act(async()=>button.click());assert.equal(input.type,"password");
    assert.equal(input.value,"fixture-password");assert.equal(submitted,0);
  } finally {await act(async()=>root.unmount());w.close();}
});
