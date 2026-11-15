"use client";
import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  return <span className="password-input-wrap">
    <input {...props} ref={ref} type={visible && !props.disabled ? "text" : "password"} />
    <button type="button" className="password-peek" aria-label="Tahan untuk melihat kata sandi" aria-pressed={visible} title="Tahan untuk melihat kata sandi" disabled={props.disabled}
      onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setVisible(true); }}
      onPointerUp={() => setVisible(false)} onPointerCancel={() => setVisible(false)} onPointerLeave={() => setVisible(false)} onLostPointerCapture={() => setVisible(false)}
      onBlur={() => setVisible(false)} onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); setVisible(true); } }}
      onKeyUp={(event) => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); setVisible(false); } }}
      onClick={(event) => event.preventDefault()}>
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </span>;
});
