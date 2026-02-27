import { ConnectionProfile, BrokerConfig, AuthIdentity, AiConfig, AiPromptsConfig } from './types';

export const STORAGE_THEME_KEY = 'mqtt-nexus:theme';
export const STORAGE_LANGUAGE_KEY = 'mqtt-nexus:language';

export const DEFAULT_BROKER: BrokerConfig = {
  id: '',
  name: 'EMQX Public',
  host: 'broker.emqx.io',
  port: 1883,
  protocol: 'mqtt',
  path: '',
  ssl: false,
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
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export const DEFAULT_AI_PROMPTS: AiPromptsConfig = {
  payloadSystemPrompt: 'You generate realistic MQTT payloads and return strict JSON only.',
  payloadUserPromptTemplate:
    'You are an MQTT payload generator. Topic: "{{topic}}". Description: "{{description}}". Return only valid JSON with no markdown fences.',
  payloadDescriptionFallback: 'Generate a realistic and usable payload for this topic.',
  topicCatalogSystemPrompt:
    'You are an MQTT protocol analyst. Extract practical topic definitions and output strict JSON only.',
  topicCatalogUserPromptTemplate: `Read the protocol document and generate a practical MQTT topic catalog.
Return strict JSON only. No markdown fences.
Response language for textual fields (name/description/summary): {{responseLanguage}}.
Keep topic strings unchanged from protocol definitions.

Output JSON shape:
{
  "summary": "short summary",
  "topics": [
    {
      "name": "display name",
      "topic": "device/+/status",
      "direction": "publish | subscribe | both",
      "qos": 0,
      "retain": false,
      "contentType": "application/json",
      "description": "what this topic means",
      "tags": ["tag1", "tag2"],
      "payloadTemplate": "{\\"field\\":\\"value\\"}",
      "payloadExample": "{\\"field\\":\\"example\\"}",
      "schema": "{\\"type\\":\\"object\\"}"
    }
  ]
}

Rules:
1. Include only meaningful business topics from the document.
2. Infer direction from protocol semantics.
3. qos must be 0/1/2 and retain must be boolean.
4. payloadTemplate/payloadExample/schema can be empty string when unknown.
5. Keep topics unique by topic path.

Source file: {{sourceName}}
Protocol document:
{{sourceText}}`,
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
