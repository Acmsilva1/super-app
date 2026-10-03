import adminUsuariosHandler from '../../lib/adminUsuariosHandler.js';
import { APPS } from '../apps.js';

export default async function handler(req, res) {
  return adminUsuariosHandler(req, res, APPS);
}
