import crypto from 'node:crypto';
import { getAlertServiceClient } from './alertServiceClient.js';
export async function consumeActionLimit(action,userId,limit=10,windowSeconds=60) {
  if (process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true') return true;
  const key=crypto.createHash('sha256').update(`${action}:${userId}`).digest('hex');
  const { data,error }=await getAlertServiceClient().rpc('consume_action_limit',{
    p_key:key,p_limit:limit,p_window_seconds:windowSeconds,
  });
  if(error) throw new Error('action_limit_unavailable');
  return data === true;
}
