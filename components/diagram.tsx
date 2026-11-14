"use client";
import { useEffect, useId, useState } from "react";
import { ErrorBox } from "./ui";
export default function Diagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""),
    [svg, setSvg] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        if (/%%\{|\bclick\s|<\s*script/i.test(source))
          throw new Error("Directive dan interaksi eksternal tidak didukung.");
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          flowchart: { htmlLabels: false },
          maxTextSize: 10000,
        });
        const result = await mermaid.render("diagram" + id, source);
        if (active) {
          setSvg(result.svg);
          setError("");
        }
      } catch {
        if (active) {
          setError("Struktur diagram belum valid. Periksa kode Mermaid.");
          setSvg("");
        }
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, id]);
  return (
    <div className="diagram">
      <ErrorBox message={error} />
      {svg && (
        <iframe
          title="Diagram materi"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={
            "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline';\"><style>body{margin:0;display:grid;place-items:center;background:transparent}svg{max-width:100%;height:auto;max-height:400px}</style></head><body>" +
            svg +
            "</body></html>"
          }
        />
      )}
    </div>
  );
}
