import level1 from './bank-level1.js';
import level2 from './bank-level2.js';
import level3 from './bank-level3.js';
import level4 from './bank-level4.js';
export const expiry='2026-08-24T23:59:59+04:00';
export const bank=[...level1,...level2,...level3,...level4];
export const byId=Object.fromEntries(bank.map(x=>[x.id,x]));
export const banks={1:level1,2:level2,3:level3,4:level4};
