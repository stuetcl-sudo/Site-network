export const DEVICE_TYPES = ["Switch", "Router / Gateway", "Fiberboks", "Mediekonverter", "NVR / Recorder", "PC / Server", "Kamera", "Access point", "Patchpanel", "UPS / Strøm", "Ukendt", "Andet"] as const;
export const CONNECTION_TYPES = ["Fiber", "Ethernet", "Coax", "Trådløs", "Strøm", "Ukendt", "Andet"] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];
export type ConnectionType = (typeof CONNECTION_TYPES)[number];
export type DeviceStatus = "active" | "offline" | "investigate" | "unknown";
export type Photo = { id: string; src: string; name: string; caption: string; createdAt: string };

export type DeviceNode = {
  id: string; name: string; type: DeviceType; status: DeviceStatus; group: string;
  x: number; y: number; ip: string; mac: string; vendor: string; model: string;
  serial: string; location: string; notes: string; photos: Photo[];
};

export type Connection = {
  id: string; from: string; to: string; type: ConnectionType; label: string;
  length: string; lengthUnit: "m" | "km"; measured: boolean; cableType: string;
  fromPort: string; toPort: string; cores: string; status: DeviceStatus; notes: string;
};

export type CanvasProject = {
  version: 2; id: string; name: string; description: string; createdAt: string;
  updatedAt: string; background: string | null; backgroundName: string;
  backgroundWidth: number; backgroundHeight: number;
  nodes: DeviceNode[]; connections: Connection[]; groups: string[];
  view: { zoom: number; panX: number; panY: number; activeGroup: string };
};

export const emptyProject = (): CanvasProject => ({
  version: 2, id: crypto.randomUUID(), name: "Nyt område", description: "",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  background: null, backgroundName: "", backgroundWidth: 1400, backgroundHeight: 900,
  nodes: [], connections: [], groups: [],
  view: { zoom: 1, panX: 0, panY: 0, activeGroup: "all" },
});
