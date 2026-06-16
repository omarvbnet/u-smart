import type { SensorSpec, ComponentPort } from './types';

const port = (kind: 'bus' | 'signal'): ComponentPort[] => [
  { id: 'out', kind, direction: 'out', label: { ar: 'إشارة', en: 'Signal', ku: 'سیگناڵ', tr: 'Sinyal' } },
];

type Seed = {
  id: string;
  type: SensorSpec['sensorType'];
  name: SensorSpec['name'];
  icon: string;
  protocol: SensorSpec['protocol'];
  currentMa: number;
};

const seeds: Seed[] = [
  { id: 'motion', type: 'MOTION', icon: 'Activity', protocol: 'KNX', currentMa: 8, name: { ar: 'حساس حركة', en: 'Motion Sensor', ku: 'هەستەوەری جووڵە', tr: 'Hareket Sensörü' } },
  { id: 'presence', type: 'PRESENCE', icon: 'UserCheck', protocol: 'KNX', currentMa: 10, name: { ar: 'حساس تواجد', en: 'Presence Sensor', ku: 'هەستەوەری ئامادەبوون', tr: 'Varlık Sensörü' } },
  { id: 'smoke', type: 'SMOKE', icon: 'CloudFog', protocol: 'DRY_CONTACT', currentMa: 20, name: { ar: 'كاشف دخان', en: 'Smoke Detector', ku: 'دۆزەرەوەی دووکەڵ', tr: 'Duman Dedektörü' } },
  { id: 'heat', type: 'HEAT', icon: 'Thermometer', protocol: 'DRY_CONTACT', currentMa: 15, name: { ar: 'كاشف حرارة', en: 'Heat Detector', ku: 'دۆزەرەوەی گەرمی', tr: 'Isı Dedektörü' } },
  { id: 'gas', type: 'GAS', icon: 'Wind', protocol: 'ANALOG', currentMa: 40, name: { ar: 'كاشف غاز', en: 'Gas Detector', ku: 'دۆزەرەوەی گاز', tr: 'Gaz Dedektörü' } },
  { id: 'water', type: 'WATER_LEAK', icon: 'Droplets', protocol: 'DRY_CONTACT', currentMa: 12, name: { ar: 'حساس تسرب ماء', en: 'Water Leak Sensor', ku: 'هەستەوەری تەڕی ئاو', tr: 'Su Kaçağı Sensörü' } },
  { id: 'lux', type: 'LUX', icon: 'SunMedium', protocol: 'KNX', currentMa: 8, name: { ar: 'حساس إضاءة', en: 'Lux Sensor', ku: 'هەستەوەری ڕووناکی', tr: 'Lux Sensörü' } },
  { id: 'temp', type: 'TEMPERATURE', icon: 'Thermometer', protocol: 'KNX', currentMa: 7, name: { ar: 'حساس حرارة', en: 'Temperature Sensor', ku: 'هەستەوەری پلەی گەرمی', tr: 'Sıcaklık Sensörü' } },
  { id: 'humidity', type: 'HUMIDITY', icon: 'Droplet', protocol: 'KNX', currentMa: 7, name: { ar: 'حساس رطوبة', en: 'Humidity Sensor', ku: 'هەستەوەری شێداری', tr: 'Nem Sensörü' } },
  { id: 'vibration', type: 'VIBRATION', icon: 'Waves', protocol: 'ANALOG', currentMa: 18, name: { ar: 'حساس اهتزاز', en: 'Vibration Sensor', ku: 'هەستەوەری لەرزین', tr: 'Titreşim Sensörü' } },
  { id: 'magnetic', type: 'MAGNETIC', icon: 'Magnet', protocol: 'DRY_CONTACT', currentMa: 5, name: { ar: 'كونتاكت مغناطيسي', en: 'Magnetic Contact', ku: 'کۆنتاکتی موگناتیسی', tr: 'Manyetik Kontak' } },
];

export const SENSORS: SensorSpec[] = seeds.map((s) => ({
  id: `sensor-${s.id}`,
  domain: 'sensor',
  category: s.type,
  name: s.name,
  manufacturer: s.protocol === 'KNX' ? 'Theben' : 'Honeywell',
  model: s.id.toUpperCase(),
  standards: s.protocol === 'KNX' ? ['KNX'] : ['NFPA 70'],
  ports: port(s.protocol === 'KNX' ? 'bus' : 'signal'),
  icon: s.icon,
  color: '#a3e635',
  sensorType: s.type,
  voltage: s.protocol === 'KNX' ? 30 : 24,
  currentMa: s.currentMa,
  protocol: s.protocol,
}));
