/** Floors a construction photo can be tied to: 0 basement, 1–9 floors, 10 roof / attic (same as the server). */
export const FLOORS = [0, 1, 2, 3, 4, 10];
const ORD = ['', '1-ci', '2-ci', '3-cü', '4-cü', '5-ci', '6-cı', '7-ci', '8-ci', '9-cu'];
export const floorLabel = (f: number) => (f === 0 ? 'Zirzəmi' : f === 10 ? 'Dam / çardaq' : `${ORD[f]} mərtəbə`);
