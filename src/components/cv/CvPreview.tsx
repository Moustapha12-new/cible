"use client";

import { useEffect, useRef, useState } from "react";
import { fitCvPage, type CvFit } from "@/lib/cv-fit";
import { cvBodyHtml, cvStyles, type CvData, type CvDesign } from "@/lib/cv";

/** A4 conservé à taille réelle puis réduit pour les petits écrans. */
export default function CvPreview({ cv, design }: { cv: CvData; design: CvDesign }) {
  const holder = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<CvFit | null>(null);
  const [dimensions, setDimensions] = useState({ scale: 1, height: 1123 });
  useEffect(() => {
    const root = paper.current?.querySelector<HTMLElement>(".cvdoc");
    if (root) setFit(fitCvPage(root, design));
    const measure = () => {
      if (!holder.current || !paper.current) return;
      setDimensions({ scale: Math.min(1, holder.current.clientWidth / 794), height: paper.current.offsetHeight });
    };
    const observer = new ResizeObserver(measure);
    if (holder.current) observer.observe(holder.current);
    if (paper.current) observer.observe(paper.current);
    measure();
    return () => observer.disconnect();
  }, [cv, design]);
  return <figure><div ref={holder} className="overflow-hidden bg-white shadow-md" style={{ height: dimensions.height * dimensions.scale }}>
    <style dangerouslySetInnerHTML={{ __html: cvStyles(design) }} />
    <div ref={paper} style={{ width: 794, minHeight: 1123, transform: `scale(${dimensions.scale})`, transformOrigin: "top left", padding: 0, boxSizing: "border-box" }}>
      <div className="cvdoc" dangerouslySetInnerHTML={{ __html: cvBodyHtml(cv, design) }} />
    </div>
  </div><figcaption className={`text-xs mt-3 ${fit?.fits ? "text-mint" : "text-amber-700"}`} role="status">{!fit ? "Vérification du format A4…" : fit.fits ? `✓ Une page A4 vérifiée · ${fit.fontSize} pt · texte conservé` : "Ce contenu dépasse une page lisible : raccourcis-le avant l’export PDF."}</figcaption></figure>;
}
