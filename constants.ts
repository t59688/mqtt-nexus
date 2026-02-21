import { ConnectionProfile, BrokerConfig, AuthIdentity, AiConfig } from './types';

export const DEFAULT_BROKER: BrokerConfig = {
  id: '',
  name: 'EMQX Public',
  host: 'broker.emqx.io',
  port: 8084,
  protocol: 'wss',
  path: '/mqtt',
  ssl: true,
};

export const DEFAULT_IDENTITY: AuthIdentity = {
  id: '',
  name: 'Anonymous',
};

export const DEFAULT_PROFILE: ConnectionProfile = {
  id: '',
  name: 'New Connection',
  group: 'General',
  colorTag: 'blue',
  ...DEFAULT_BROKER,
  protocolVersion: 4,
  clientId: `nexus-${Math.random().toString(16).substring(2, 10)}`,
  clean: true,
  username: '',
  password: '',
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: import.meta.env.VITE_AI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: import.meta.env.VITE_AI_API_KEY || '',
  model: import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini',
};

export const COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

export const TAG_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-500',
};

export const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
