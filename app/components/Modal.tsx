"use client";

import { X } from "lucide-react";

export function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onClick={close}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div><div className="eyebrow">RALLY365</div><h2>{title}</h2></div>
        <button className="icon-button" onClick={close}><X /></button>
      </div>
      {children}
    </div>
  </div>;
}
