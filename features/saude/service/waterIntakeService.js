export const WATER_AMOUNTS_ML = Object.freeze([100, 200, 300, 400, 500, 1000, 2000]);
export const validWaterAmount = value => WATER_AMOUNTS_ML.includes(Number(value));
export const validWaterGoal = value => Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 10000;
export const validWaterRequestId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{8,160}$/.test(value);

export const waterAmountLabel = amount => Number(amount)>=1000 ? `${Number(amount)/1000} L` : `${amount} ml`;
