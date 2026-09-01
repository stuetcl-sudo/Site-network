"use client";

import {
  Cable, Camera, ChevronLeft, ChevronRight, CircleHelp, FilePlus2, Focus,
  HardDrive, ImagePlus, Map, Monitor, Network, Plus, Printer, Radio, Router,
  Save, Search, Server, Trash2, Upload, Wifi, X, Zap, ZoomIn, ZoomOut,
} from "lucide-react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONNECTION_TYPES, DEVICE_TYPES, emptyProject } from "./types";
import type { CanvasProject, Connection, ConnectionType, DeviceNode, DeviceStatus, DeviceType } from "./types";
import { loadProject, saveProject } from "./storage";

const WORLD = { width: 3200, height: 2200 };
const statusLabels: Record<DeviceStatus, string> = { active: "Aktiv", offline: "Offline", investigate: "Skal undersøges", unknown: "Ukendt" };
const deviceMeta: Record<DeviceType, { icon: typeof Network; color: string; prefix: string }> = {
  Switch: { icon: Network, color: "#38bdf8", prefix: "SW" },
  "Router / Gateway": { icon: Router, color: "#a78bfa", prefix: "GW" },
  Fiberboks: { icon: Cable, color: "#4ade80", prefix: "FB" },
  Mediekonverter: { icon: Radio, color: "#2dd4bf", prefix: "MC" },
  "NVR / Recorder": { icon: HardDrive, color: "#fb7185", prefix: "NVR" },
  "PC / Server": { icon: Monitor, color: "#cbd5e1", prefix: "PC" },
  Kamera: { icon: Camera, color: "#fb923c", prefix: "CAM" },
  "Access point": { icon: Wifi, color: "#22d3ee", prefix: "AP" },
  Patchpanel: { icon: Server, color: "#818cf8", prefix: "PP" },
  "UPS / Strøm": { icon: Zap, color: "#facc15", prefix: "UPS" },
  Ukendt: { icon: CircleHelp, color: "#94a3b8", prefix: "UK" },
  Andet: { icon: Plus, color: "#94a3b8", prefix: "DEV" },
};
const connectionColors: Record<ConnectionType, string> = { Fiber: "#4ade80", Ethernet: "#38bdf8", Coax: "#fb923c", Trådløs: "#c084fc", Strøm: "#facc15", Ukendt: "#94a3b8", Andet: "#cbd5e1" };

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function distanceText(connection: Connection) {
  return connection.length.trim() ? `${connection.measured ? "" : "ca. "}${connection.length} ${connection.lengthUnit}` : "";
}

function normalizeImported(raw: unknown): CanvasProject {
  if (!raw || typeof raw !== "object") throw new Error("Ugyldigt projekt");
  const value = raw as Partial<CanvasProject> & { links?: Array<Record<string, unknown>>; bg?: string };
  const base = emptyProject();
  const nodes = Array.isArray(value.nodes) ? value.nodes.map((item) => {
    const node = item as Partial<DeviceNode> & { photos?: Array<string | DeviceNode["photos"][number]> };
    return {
      id: node.id || crypto.randomUUID(), name: node.name || "Uden navn",
      type: DEVICE_TYPES.includes(node.type as DeviceType) ? node.type as DeviceType : "Ukendt",
      status: node.status || "unknown", group: node.group || "", x: Number(node.x) || 300, y: Number(node.y) || 300,
      ip: node.ip || "", mac: node.mac || "", vendor: node.vendor || "", model: node.model || "",
      serial: node.serial || "", location: node.location || "", notes: node.notes || "",
      photos: (node.photos || []).map((photo) => typeof photo === "string"
        ? { id: crypto.randomUUID(), src: photo, name: "Foto", caption: "", createdAt: new Date().toISOString() }
        : { ...photo, id: photo.id || crypto.randomUUID(), caption: photo.caption || "" }),
    } satisfies DeviceNode;
  }) : [];
  const legacyLinks = Array.isArray(value.links) ? value.links : [];
  const rawConnections = Array.isArray(value.connections) ? value.connections : legacyLinks;
  const connections = rawConnections.map((item) => {
    const c = item as Partial<Connection> & { a?: string; b?: string };
    return {
      id: c.id || crypto.randomUUID(), from: c.from || c.a || "", to: c.to || c.b || "",
      type: CONNECTION_TYPES.includes(c.type as ConnectionType) ? c.type as ConnectionType : "Ukendt",
      label: c.label || "", length: c.length || "", lengthUnit: c.lengthUnit || "m", measured: c.measured ?? false,
      cableType: c.cableType || "", fromPort: c.fromPort || "", toPort: c.toPort || "", cores: c.cores || "",
      status: c.status || "unknown", notes: c.notes || "",
    } satisfies Connection;
  });
  return { ...base, ...value, version: 2, id: value.id || base.id, name: value.name || "Importeret område",
    background: value.background || value.bg || null, backgroundName: value.backgroundName || "",
    backgroundWidth: Number(value.backgroundWidth) || 1400, backgroundHeight: Number(value.backgroundHeight) || 900, nodes, connections,
    groups: Array.isArray(value.groups) ? value.groups : [], view: { ...base.view, ...(value.view || {}) }, updatedAt: new Date().toISOString() };
}

export function SiteCanvas() {
  const [project, setProject] = useState<CanvasProject | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [query, setQuery] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [saveState, setSaveState] = useState("Klar");
  const [printMode, setPrintMode] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const projectRef = useRef<CanvasProject | null>(null);

  useEffect(() => { loadProject().then((saved) => setProject(saved ? normalizeImported(saved) : emptyProject())).catch(() => setProject(emptyProject())); }, []);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => saveProject({ ...project, updatedAt: new Date().toISOString() }).then(() => setSaveState("Gemt")).catch(() => setSaveState("Kunne ikke gemme")), 350);
    return () => clearTimeout(timer);
  }, [project]);

  const change = (recipe: (current: CanvasProject) => CanvasProject) => setProject((current) => current ? recipe(current) : current);
  const selectedNode = project?.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedConnection = project?.connections.find((connection) => connection.id === selectedConnectionId) || null;
  const visibleNodes = useMemo(() => {
    if (!project) return [];
    const q = query.trim().toLocaleLowerCase("da");
    return project.nodes.filter((node) => (project.view.activeGroup === "all" || node.group === project.view.activeGroup)
      && (!q || [node.name, node.ip, node.mac, node.vendor, node.model, node.location, node.notes].some((field) => field.toLocaleLowerCase("da").includes(q))));
  }, [project, query]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const current = projectRef.current, rect = wrapRef.current?.getBoundingClientRect();
      if (!current || !rect) return;
      if (dragRef.current) {
        const { id, dx, dy } = dragRef.current;
        const x = (event.clientX - rect.left - current.view.panX) / current.view.zoom - dx;
        const y = (event.clientY - rect.top - current.view.panY) / current.view.zoom - dy;
        setProject((state) => state ? ({ ...state, nodes: state.nodes.map((node) => node.id === id ? { ...node, x: Math.max(0, x), y: Math.max(0, y) } : node) }) : state);
      } else if (panRef.current) {
        setProject((state) => state ? ({ ...state, view: { ...state.view, panX: event.clientX - panRef.current!.x, panY: event.clientY - panRef.current!.y } }) : state);
      }
    };
    const stop = () => { dragRef.current = null; panRef.current = null; };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
  }, []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setConnectMode(false); setConnectFrom(null); }
      if ((event.key === "Delete" || event.key === "Backspace") && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLSelectElement)) {
        setProject((state) => state ? ({ ...state,
          nodes: selectedNodeId ? state.nodes.filter((node) => node.id !== selectedNodeId) : state.nodes,
          connections: selectedNodeId ? state.connections.filter((connection) => connection.from !== selectedNodeId && connection.to !== selectedNodeId) : selectedConnectionId ? state.connections.filter((connection) => connection.id !== selectedConnectionId) : state.connections,
        }) : state);
        setSelectedNodeId(null); setSelectedConnectionId(null);
      }
    };
    window.addEventListener("keydown", keys); return () => window.removeEventListener("keydown", keys);
  }, [selectedNodeId, selectedConnectionId]);

  if (!project) return <main className="loading-screen"><Network size={34} /><span>Åbner Site Canvas…</span></main>;
  const setView = (patch: Partial<CanvasProject["view"]>) => change((current) => ({ ...current, view: { ...current.view, ...patch } }));

  const addNode = (type: DeviceType) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const count = project.nodes.filter((node) => node.type === type).length + 1;
    const node: DeviceNode = {
      id: crypto.randomUUID(), name: `${deviceMeta[type].prefix}-${String(count).padStart(2, "0")}`, type, status: "unknown",
      group: project.view.activeGroup === "all" ? "" : project.view.activeGroup,
      x: ((rect?.width || 900) / 2 - project.view.panX) / project.view.zoom - 55 + count * 5,
      y: ((rect?.height || 600) / 2 - project.view.panY) / project.view.zoom - 22 + count * 5,
      ip: "", mac: "", vendor: "", model: "", serial: "", location: "", notes: "", photos: [],
    };
    change((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id); setSelectedConnectionId(null); setInspectorOpen(true);
  };

  const selectNode = (id: string) => {
    if (connectMode) {
      if (!connectFrom) { setConnectFrom(id); return; }
      if (connectFrom === id) return;
      const connection: Connection = { id: crypto.randomUUID(), from: connectFrom, to: id, type: "Ethernet", label: "", length: "", lengthUnit: "m", measured: false, cableType: "", fromPort: "", toPort: "", cores: "", status: "unknown", notes: "" };
      change((current) => ({ ...current, connections: [...current.connections, connection] }));
      setSelectedNodeId(null); setSelectedConnectionId(connection.id); setConnectFrom(null); setConnectMode(false); setInspectorOpen(true); return;
    }
    setSelectedNodeId(id); setSelectedConnectionId(null); setInspectorOpen(true);
  };

  const updateNode = (patch: Partial<DeviceNode>) => selectedNodeId && change((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNodeId ? { ...node, ...patch } : node) }));
  const updateConnection = (patch: Partial<Connection>) => selectedConnectionId && change((current) => ({ ...current, connections: current.connections.map((connection) => connection.id === selectedConnectionId ? { ...connection, ...patch } : connection) }));
  const deleteSelected = () => {
    if (selectedNodeId) { change((current) => ({ ...current, nodes: current.nodes.filter((node) => node.id !== selectedNodeId), connections: current.connections.filter((connection) => connection.from !== selectedNodeId && connection.to !== selectedNodeId) })); setSelectedNodeId(null); }
    else if (selectedConnectionId) { change((current) => ({ ...current, connections: current.connections.filter((connection) => connection.id !== selectedConnectionId) })); setSelectedConnectionId(null); }
  };

  const startNodeDrag = (event: ReactMouseEvent, node: DeviceNode) => {
    if (connectMode) return;
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return;
    event.stopPropagation();
    dragRef.current = { id: node.id, dx: (event.clientX - rect.left - project.view.panX) / project.view.zoom - node.x, dy: (event.clientY - rect.top - project.view.panY) / project.view.zoom - node.y };
    selectNode(node.id);
  };
  const startPan = (event: ReactMouseEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest(".map-node, .map-link, .map-controls, .mode-banner")) return;
    panRef.current = { x: event.clientX - project.view.panX, y: event.clientY - project.view.panY };
    setSelectedNodeId(null); setSelectedConnectionId(null);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault(); const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return;
    const oldZoom = project.view.zoom, zoom = Math.min(2.5, Math.max(0.2, oldZoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    const cx = event.clientX - rect.left, cy = event.clientY - rect.top;
    const wx = (cx - project.view.panX) / oldZoom, wy = (cy - project.view.panY) / oldZoom;
    setView({ zoom, panX: cx - wx * zoom, panY: cy - wy * zoom });
  };
  const fitView = () => {
    const rect = wrapRef.current?.getBoundingClientRect(); if (!rect) return;
    const points = project.nodes.length ? project.nodes : [{ x: 0, y: 0 }, { x: 1200, y: 800 }];
    let minX = Math.min(...points.map((node) => node.x)) - 100, minY = Math.min(...points.map((node) => node.y)) - 100;
    let maxX = Math.max(...points.map((node) => node.x)) + 220, maxY = Math.max(...points.map((node) => node.y)) + 150;
    if (project.background) { minX = Math.min(minX, 0); minY = Math.min(minY, 0); maxX = Math.max(maxX, 1400); maxY = Math.max(maxY, 900); }
    const zoom = Math.min(1.4, Math.max(0.2, Math.min((rect.width - 60) / (maxX - minX), (rect.height - 60) / (maxY - minY))));
    setView({ zoom, panX: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom, panY: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom });
  };

  const addGroup = () => {
    const name = window.prompt("Navn på gruppen, fx Kontor")?.trim(); if (!name) return;
    if (!project.groups.includes(name)) change((current) => ({ ...current, groups: [...current.groups, name] }));
    if (selectedNodeId) updateNode({ group: name });
  };
  const applyBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const background = await fileAsDataUrl(file);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || 1400, height: image.naturalHeight || 900 });
      image.onerror = () => resolve({ width: 1400, height: 900 });
      image.src = background;
    });
    change((current) => ({ ...current, background, backgroundName: file.name, backgroundWidth: dimensions.width, backgroundHeight: dimensions.height })); event.target.value = "";
  };
  const onPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []), targetId = selectedNodeId; if (!targetId || !files.length) return;
    const photos = await Promise.all(files.map(async (file) => ({ id: crypto.randomUUID(), src: await fileAsDataUrl(file), name: file.name, caption: "", createdAt: new Date().toISOString() })));
    change((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === targetId ? { ...node, photos: [...node.photos, ...photos] } : node) })); event.target.value = "";
  };

  const exportProject = async () => {
    const json = JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2);
    const filename = `${project.name.toLocaleLowerCase("da").replace(/[^a-z0-9æøå]+/gi, "-").replace(/^-|-$/g, "") || "site-canvas"}.sitecanvas.json`;
    try {
      const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
      if (picker) { const handle = await picker({ suggestedName: filename, types: [{ description: "Site Canvas projekt", accept: { "application/json": [".json"] } }] }); const writer = await handle.createWritable(); await writer.write(json); await writer.close(); setSaveState("Projektfil gemt"); return; }
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) { if ((error as DOMException).name !== "AbortError") setExportText(json); }
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { setProject(normalizeImported(JSON.parse(await file.text()))); setSelectedNodeId(null); setSelectedConnectionId(null); setSaveState("Projekt åbnet"); }
    catch { window.alert("Projektfilen kunne ikke åbnes. Kontrollér at det er en Site Canvas JSON-fil."); }
    event.target.value = "";
  };
  const startPrint = async () => {
    setPrintMode(true); await new Promise((resolve) => setTimeout(resolve, 120));
    await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".print-report img")).map((image) => image.decode?.().catch(() => undefined)));
    window.print(); setTimeout(() => setPrintMode(false), 400);
  };

  const overview = project.view.zoom < 0.48 && project.view.activeGroup === "all" && !query;
  const grouped = project.groups.map((group) => ({ group, nodes: project.nodes.filter((node) => node.group === group) })).filter((entry) => entry.nodes.length);
  return (
    <main className={`site-shell ${inspectorOpen ? "" : "inspector-collapsed"} ${printMode ? "is-printing" : ""}`}>
      <header className="topbar">
        <div className="brand-mark"><Network /><span>Site Canvas</span></div>
        <Input className="project-name" aria-label="Projektnavn" value={project.name} onChange={(event) => change((current) => ({ ...current, name: event.target.value }))} />
        <div className="top-actions">
          <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()}><ImagePlus /> Baggrund</Button>
          <Button variant={connectMode ? "default" : "outline"} size="sm" onClick={() => { setConnectMode(!connectMode); setConnectFrom(null); }}><Cable /> {connectFrom ? "Vælg slutpunkt" : "Forbind"}</Button>
          <Button variant="outline" size="icon-sm" title="Tilpas kortet" onClick={fitView}><Focus /></Button>
          <Button variant="outline" size="sm" onClick={exportProject}><Save /> Gem projekt</Button>
          <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}><Upload /> Åbn</Button>
          <Button variant="outline" size="sm" onClick={startPrint}><Printer /> Print / PDF</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Opret et nyt tomt projekt? Eksportér det nuværende først, hvis det skal flyttes.")) { setProject(emptyProject()); setSelectedNodeId(null); setSelectedConnectionId(null); } }}><FilePlus2 /> Nyt</Button>
        </div>
        <div className="save-state"><span className={saveState === "Gemt" ? "saved-dot" : ""} />{saveState}</div>
        <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={applyBackground} />
        <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={importProject} />
      </header>

      <aside className="toolbox">
        <div className="panel-heading">Tilføj udstyr</div>
        <div className="device-grid">{DEVICE_TYPES.map((type) => { const Icon = deviceMeta[type].icon; return <button key={type} className="device-button" onClick={() => addNode(type)}><Icon style={{ color: deviceMeta[type].color }} /><span>{type}</span></button>; })}</div>
        <div className="toolbox-tip"><Cable /><span>Vælg <b>Forbind</b>, og klik på to enheder. Udfyld derefter afstand og kabeldetaljer til højre.</span></div>
      </aside>

      <section className="workspace-head">
        <div className="group-tabs"><button className={project.view.activeGroup === "all" ? "active" : ""} onClick={() => setView({ activeGroup: "all" })}>Alle <b>{project.nodes.length}</b></button>{project.groups.map((group) => <button key={group} className={project.view.activeGroup === group ? "active" : ""} onClick={() => setView({ activeGroup: group })}>{group} <b>{project.nodes.filter((node) => node.group === group).length}</b></button>)}<button className="new-group" onClick={addGroup}><Plus /> Ny gruppe</button></div>
        <label className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg navn, IP, model eller note" /></label>
      </section>

      <section ref={wrapRef} className={`map-wrap ${connectMode ? "connecting" : ""}`} onMouseDown={startPan} onWheel={onWheel}>
        <div className="world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate(${project.view.panX}px, ${project.view.panY}px) scale(${project.view.zoom})` }}>
          <div className="map-grid" />
          {project.background && <img className="map-background" width={project.backgroundWidth} height={project.backgroundHeight} src={project.background} alt={`Baggrundskort: ${project.backgroundName || project.name}`} />}
          {!overview && <svg className="connection-layer" width={WORLD.width} height={WORLD.height}>{project.connections.map((connection) => {
            const from = project.nodes.find((node) => node.id === connection.from), to = project.nodes.find((node) => node.id === connection.to); if (!from || !to) return null;
            if (project.view.activeGroup !== "all" && from.group !== project.view.activeGroup && to.group !== project.view.activeGroup) return null;
            const x1 = from.x + 55, y1 = from.y + 22, x2 = to.x + 55, y2 = to.y + 22, mid = (x1 + x2) / 2;
            const path = `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`, label = [connection.label || connection.type, distanceText(connection)].filter(Boolean).join(" · ");
            return <g key={connection.id} className={`map-link ${selectedConnectionId === connection.id ? "selected" : ""}`} onMouseDown={(event) => { event.stopPropagation(); setSelectedConnectionId(connection.id); setSelectedNodeId(null); setInspectorOpen(true); }}><path className="link-hit" d={path} /><path className={`link-visible ${connection.type === "Trådløs" ? "wireless" : ""}`} d={path} stroke={connectionColors[connection.type]} />{label && <text x={mid + 6} y={(y1 + y2) / 2 - 7} className="link-label">{label}</text>}</g>;
          })}</svg>}
          {overview ? grouped.map(({ group, nodes }) => { const x = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length, y = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length; return <button key={group} className="group-bubble" style={{ left: x, top: y }} onClick={(event) => { event.stopPropagation(); setView({ activeGroup: group, zoom: .85, panX: (wrapRef.current?.clientWidth || 900) / 2 - x * .85, panY: (wrapRef.current?.clientHeight || 600) / 2 - y * .85 }); }}><Map /><span>{group}</span><small>{nodes.length} enheder</small></button>; }) : visibleNodes.map((node) => { const meta = deviceMeta[node.type], Icon = meta.icon; return <button key={node.id} className={`map-node ${selectedNodeId === node.id ? "selected" : ""} ${connectFrom === node.id ? "connect-source" : ""}`} style={{ left: node.x, top: node.y, "--node-color": meta.color } as React.CSSProperties} onMouseDown={(event) => startNodeDrag(event, node)} onClick={(event) => { event.stopPropagation(); selectNode(node.id); }}><Icon /><span>{node.name}</span><i className={`status-dot ${node.status}`} /></button>; })}
        </div>
        {!project.background && project.nodes.length === 0 && <div className="empty-map"><div className="empty-icon"><Map /></div><h2>Start med et kort eller en enhed</h2><p>Upload et satellitfoto eller en plantegning, og placer derefter udstyret ovenpå.</p><div><Button onClick={() => bgInputRef.current?.click()}><ImagePlus /> Vælg baggrundskort</Button><Button variant="outline" onClick={() => addNode("Switch")}><Plus /> Tilføj første enhed</Button></div></div>}
        <div className="map-controls"><Button variant="secondary" size="icon-sm" onClick={() => setView({ zoom: Math.min(2.5, project.view.zoom * 1.15) })}><ZoomIn /></Button><span>{Math.round(project.view.zoom * 100)}%</span><Button variant="secondary" size="icon-sm" onClick={() => setView({ zoom: Math.max(.2, project.view.zoom / 1.15) })}><ZoomOut /></Button><Button variant="secondary" size="icon-sm" onClick={fitView}><Focus /></Button></div>
        {connectMode && <div className="mode-banner"><Cable /> {connectFrom ? "Klik på den enhed forbindelsen skal ende ved" : "Klik på den første enhed"}<button onClick={() => { setConnectMode(false); setConnectFrom(null); }}><X /></button></div>}
      </section>

      <button className="inspector-toggle" onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? <ChevronRight /> : <ChevronLeft />}</button>
      <aside className="inspector">{selectedNode ? <NodeInspector node={selectedNode} groups={project.groups} updateNode={updateNode} addGroup={addGroup} deleteSelected={deleteSelected} photoInputRef={photoInputRef} onPhotos={onPhotos} /> : selectedConnection ? <ConnectionInspector connection={selectedConnection} nodes={project.nodes} updateConnection={updateConnection} deleteSelected={deleteSelected} /> : <ProjectInspector project={project} change={change} />}</aside>
      <PrintReport project={project} />
      {exportText && <div className="modal-backdrop"><section className="export-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setExportText(null)}><X /></button><h2>Projektdata</h2><p>Browseren blokerede filen. Kopiér teksten og gem den som en <code>.json</code>-fil.</p><Textarea value={exportText} readOnly onFocus={(event) => event.target.select()} /><Button onClick={async () => { await navigator.clipboard.writeText(exportText); setSaveState("Kopieret"); }}>Kopiér data</Button></section></div>}
    </main>
  );
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="field"><span>{label}</span><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>; }

function NodeInspector({ node, groups, updateNode, addGroup, deleteSelected, photoInputRef, onPhotos }: { node: DeviceNode; groups: string[]; updateNode: (patch: Partial<DeviceNode>) => void; addGroup: () => void; deleteSelected: () => void; photoInputRef: React.RefObject<HTMLInputElement | null>; onPhotos: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <div className="inspector-content"><div className="inspector-title"><div><span className="eyebrow">Enhed</span><h2>{node.name}</h2></div><span className={`status-pill ${node.status}`}>{statusLabels[node.status]}</span></div>
    <Field label="Navn" value={node.name} onChange={(name) => updateNode({ name })} /><div className="field-row"><SelectField label="Type" value={node.type} onChange={(type) => updateNode({ type: type as DeviceType })}>{DEVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</SelectField><SelectField label="Status" value={node.status} onChange={(status) => updateNode({ status: status as DeviceStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></div>
    <div className="field-with-action"><SelectField label="Gruppe" value={node.group} onChange={(group) => updateNode({ group })}><option value="">Ingen gruppe</option>{groups.map((group) => <option key={group}>{group}</option>)}</SelectField><Button variant="outline" size="icon-sm" onClick={addGroup}><Plus /></Button></div>
    <div className="field-row"><Field label="IP-adresse" value={node.ip} onChange={(ip) => updateNode({ ip })} placeholder="192.168.1.10" /><Field label="MAC-adresse" value={node.mac} onChange={(mac) => updateNode({ mac })} /></div><div className="field-row"><Field label="Producent" value={node.vendor} onChange={(vendor) => updateNode({ vendor })} /><Field label="Model" value={node.model} onChange={(model) => updateNode({ model })} /></div>
    <Field label="Serienummer" value={node.serial} onChange={(serial) => updateNode({ serial })} /><Field label="Fysisk placering" value={node.location} onChange={(location) => updateNode({ location })} placeholder="Fx øverst i hvid boks" /><label className="field"><span>Noter</span><Textarea value={node.notes} onChange={(event) => updateNode({ notes: event.target.value })} placeholder="Hvad skal den næste tekniker vide?" /></label>
    <div className="photo-heading"><div><span className="eyebrow">Billeder</span><b>{node.photos.length} foto{node.photos.length === 1 ? "" : "s"}</b></div><Button variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}><ImagePlus /> Tilføj</Button><input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={onPhotos} /></div>
    <div className="photo-grid">{node.photos.map((photo) => <figure key={photo.id}><img src={photo.src} alt={photo.caption || photo.name} /><button title="Slet foto" onClick={() => updateNode({ photos: node.photos.filter((item) => item.id !== photo.id) })}><X /></button><input aria-label="Billedtekst" value={photo.caption} placeholder="Billedtekst" onChange={(event) => updateNode({ photos: node.photos.map((item) => item.id === photo.id ? { ...item, caption: event.target.value } : item) })} /></figure>)}</div>
    <Button variant="destructive" className="delete-action" onClick={() => window.confirm(`Slet ${node.name} og alle dens forbindelser?`) && deleteSelected()}><Trash2 /> Slet enhed</Button></div>;
}

function ConnectionInspector({ connection, nodes, updateConnection, deleteSelected }: { connection: Connection; nodes: DeviceNode[]; updateConnection: (patch: Partial<Connection>) => void; deleteSelected: () => void }) {
  const from = nodes.find((node) => node.id === connection.from), to = nodes.find((node) => node.id === connection.to);
  return <div className="inspector-content"><div className="inspector-title"><div><span className="eyebrow">Forbindelse</span><h2>{from?.name || "Ukendt"} → {to?.name || "Ukendt"}</h2></div><span className="connection-swatch" style={{ background: connectionColors[connection.type] }} /></div>
    <SelectField label="Forbindelsestype" value={connection.type} onChange={(type) => updateConnection({ type: type as ConnectionType })}>{CONNECTION_TYPES.map((type) => <option key={type}>{type}</option>)}</SelectField><Field label="Navn / mærkning" value={connection.label} onChange={(label) => updateConnection({ label })} placeholder="Fx Fiber mod hal 2" />
    <div className="field-row distance-row"><Field label="Afstand / længde" value={connection.length} onChange={(length) => updateConnection({ length: length.replace(/[^0-9.,]/g, "") })} placeholder="185" /><SelectField label="Enhed" value={connection.lengthUnit} onChange={(lengthUnit) => updateConnection({ lengthUnit: lengthUnit as "m" | "km" })}><option value="m">meter</option><option value="km">kilometer</option></SelectField></div><label className="check-field"><input type="checkbox" checked={connection.measured} onChange={(event) => updateConnection({ measured: event.target.checked })} /><span>Afstanden er målt</span></label>
    <Field label="Kabel / medie" value={connection.cableType} onChange={(cableType) => updateConnection({ cableType })} placeholder="Fx OS2 12-fiber, Cat6 eller 5 GHz" /><div className="field-row"><Field label={`Port på ${from?.name || "start"}`} value={connection.fromPort} onChange={(fromPort) => updateConnection({ fromPort })} placeholder="SFP1" /><Field label={`Port på ${to?.name || "slut"}`} value={connection.toPort} onChange={(toPort) => updateConnection({ toPort })} placeholder="SFP2" /></div><div className="field-row"><Field label="Fiberpar / leder / kanal" value={connection.cores} onChange={(cores) => updateConnection({ cores })} placeholder="Fx fiber 5/6" /><SelectField label="Status" value={connection.status} onChange={(status) => updateConnection({ status: status as DeviceStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></div>
    <label className="field"><span>Noter om forbindelsen</span><Textarea value={connection.notes} onChange={(event) => updateConnection({ notes: event.target.value })} placeholder="Rute, samlinger, fejl eller andet" /></label><div className="connection-summary"><Cable /><div><b>{connection.type}{distanceText(connection) ? ` · ${distanceText(connection)}` : ""}</b><span>{connection.fromPort || "Ukendt port"} → {connection.toPort || "Ukendt port"}</span></div></div><Button variant="destructive" className="delete-action" onClick={() => window.confirm("Slet forbindelsen?") && deleteSelected()}><Trash2 /> Slet forbindelse</Button></div>;
}

function ProjectInspector({ project, change }: { project: CanvasProject; change: (recipe: (current: CanvasProject) => CanvasProject) => void }) {
  const photos = project.nodes.reduce((sum, node) => sum + node.photos.length, 0);
  const meters = project.connections.reduce((sum, c) => sum + (Number(c.length.replace(",", ".")) || 0) * (c.lengthUnit === "km" ? 1000 : 1), 0);
  return <div className="inspector-content project-panel"><span className="eyebrow">Projekt</span><h2>{project.name}</h2><p>Vælg en enhed eller forbindelse på kortet for at redigere den.</p><label className="field"><span>Projektbeskrivelse</span><Textarea value={project.description} onChange={(event) => change((current) => ({ ...current, description: event.target.value }))} placeholder="Adresse, kunde eller arbejdets omfang" /></label><div className="stat-grid"><div><Network /><b>{project.nodes.length}</b><span>Enheder</span></div><div><Cable /><b>{project.connections.length}</b><span>Forbindelser</span></div><div><ImagePlus /><b>{photos}</b><span>Billeder</span></div><div><Map /><b>{meters ? `${Math.round(meters)} m` : "—"}</b><span>Registreret længde</span></div></div><div className="legend"><span className="eyebrow">Forbindelser</span>{CONNECTION_TYPES.slice(0, 5).map((type) => <div key={type}><i style={{ background: connectionColors[type] }} />{type}</div>)}</div></div>;
}

function PrintReport({ project }: { project: CanvasProject }) {
  const nodes = [...project.nodes].sort((a, b) => (a.group || "Uden gruppe").localeCompare(b.group || "Uden gruppe", "da") || a.name.localeCompare(b.name, "da"));
  const mapWidth = Math.max(project.backgroundWidth, ...project.nodes.map((node) => node.x + 130), 1200);
  const mapHeight = Math.max(project.backgroundHeight, ...project.nodes.map((node) => node.y + 80), 800);
  return <article className="print-report"><header><div><span>Netværks- og infrastrukturdokumentation</span><h1>{project.name}</h1><p>{project.description}</p></div><div><b>Udskrevet</b><span>{new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</span></div></header><section className="print-summary"><div><b>{project.nodes.length}</b><span>Enheder</span></div><div><b>{project.connections.length}</b><span>Forbindelser</span></div><div><b>{project.groups.length}</b><span>Områder</span></div><div><b>{project.nodes.reduce((sum, node) => sum + node.photos.length, 0)}</b><span>Billeder</span></div></section>
    <section className="print-map-page"><h2>Oversigtskort</h2><svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} role="img" aria-label={`Oversigtskort for ${project.name}`}>{project.background && <image href={project.background} x="0" y="0" width={project.backgroundWidth} height={project.backgroundHeight} />}{project.connections.map((connection) => { const from = project.nodes.find((node) => node.id === connection.from), to = project.nodes.find((node) => node.id === connection.to); if (!from || !to) return null; const x1 = from.x + 55, y1 = from.y + 22, x2 = to.x + 55, y2 = to.y + 22, mid = (x1 + x2) / 2; return <g key={connection.id}><path d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} fill="none" stroke={connectionColors[connection.type]} strokeWidth="4" />{distanceText(connection) && <text x={mid + 7} y={(y1 + y2) / 2 - 8}>{distanceText(connection)}</text>}</g>; })}{project.nodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`}><rect width="110" height="44" rx="7" fill="#0f172a" stroke={deviceMeta[node.type].color} strokeWidth="2" /><text x="10" y="27" fill="white" fontSize="13" fontWeight="700">{node.name.slice(0, 15)}</text></g>)}</svg></section>
    <section className="print-section connections-table"><h2>Forbindelsesoversigt</h2><table><thead><tr><th>Fra</th><th>Til</th><th>Type</th><th>Afstand</th><th>Kabel / medie</th><th>Porte / fibre</th><th>Noter</th></tr></thead><tbody>{project.connections.map((connection) => { const from = project.nodes.find((node) => node.id === connection.from), to = project.nodes.find((node) => node.id === connection.to); return <tr key={connection.id}><td>{from?.name || "Ukendt"}</td><td>{to?.name || "Ukendt"}</td><td>{connection.type}{connection.label && <small>{connection.label}</small>}</td><td>{distanceText(connection) || "—"}</td><td>{connection.cableType || "—"}</td><td>{[connection.fromPort, connection.toPort, connection.cores].filter(Boolean).join(" / ") || "—"}</td><td>{connection.notes || "—"}</td></tr>; })}</tbody></table></section>
    <section className="print-section"><h2>Enheder og billeder</h2>{nodes.map((node) => { const links = project.connections.filter((connection) => connection.from === node.id || connection.to === node.id); return <section key={node.id} className="print-node"><div className="print-node-head"><div><span>{node.group || "Uden gruppe"} · {node.type}</span><h3>{node.name}</h3></div><b>{statusLabels[node.status]}</b></div><dl>{[["IP-adresse", node.ip], ["MAC-adresse", node.mac], ["Producent / model", [node.vendor, node.model].filter(Boolean).join(" ")], ["Serienummer", node.serial], ["Placering", node.location]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{node.notes && <div className="print-notes"><b>Noter</b><p>{node.notes}</p></div>}{links.length > 0 && <div className="print-node-links"><b>Forbindelser</b>{links.map((connection) => { const other = project.nodes.find((item) => item.id === (connection.from === node.id ? connection.to : connection.from)); return <p key={connection.id}>{connection.type}{distanceText(connection) ? ` · ${distanceText(connection)}` : ""} → {other?.name || "Ukendt"}{connection.notes ? ` — ${connection.notes}` : ""}</p>; })}</div>}{node.photos.length > 0 && <div className="print-photos">{node.photos.map((photo, index) => <figure key={photo.id}><img src={photo.src} alt={photo.caption || `${node.name} foto ${index + 1}`} /><figcaption>{photo.caption || photo.name || `Foto ${index + 1}`}</figcaption></figure>)}</div>}</section>; })}</section></article>;
}
