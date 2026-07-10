export type Role = 'admin' | 'supervisor' | 'annotator' | 'verifier' | 'ml_engineer' | 'customer';
export type Speaker = 'TATLIN' | 'VEGMAN' | '[CROSSTALK]' | '[OVERLAP]' | '[SILENCE]';
export interface DemoUser { name: string; email: string; role: Role }
export interface Segment { id: string; start: number; end: number; text: string; speaker: Speaker; confidence: number; lockedBy?: string }
export interface Marker { id: string; segmentId: string; title: string; severity: 'critical' | 'warning'; status: 'open' | 'fixed' | 'confirmed' }
