import type { SmartHomeSpec, ComponentPort } from './types';

const busPort: ComponentPort[] = [
  { id: 'bus', kind: 'bus', direction: 'inout', label: { ar: 'الناقل', en: 'Bus', ku: 'باس', tr: 'Bus' } },
];

const actuatorPorts: ComponentPort[] = [
  { id: 'bus', kind: 'bus', direction: 'inout', label: { ar: 'الناقل', en: 'Bus', ku: 'باس', tr: 'Bus' } },
  { id: 'out', kind: 'power', direction: 'out', label: { ar: 'خرج الحمل', en: 'Load Out', ku: 'دەرچوونی بار', tr: 'Yük Çıkışı' } },
];

type Seed = {
  id: string;
  deviceClass: string;
  name: SmartHomeSpec['name'];
  icon: string;
  channels: number;
  channelCurrentA: number | null;
  busCurrentMa: number;
  busSupplyMa?: number;
  actuator: boolean;
};

/* ----------------------------- HDL Buspro ----------------------------- */
const hdlSeeds: Seed[] = [
  { id: 'buspsu', deviceClass: 'Bus PSU', icon: 'Zap', channels: 0, channelCurrentA: null, busCurrentMa: 0, busSupplyMa: 640, actuator: false, name: { ar: 'مزود طاقة باص HDL 640mA', en: 'HDL Bus PSU 640mA', ku: 'PSU باز HDL 640mA', tr: 'HDL Veri Yolu PSU 640mA' } },
  { id: 'relay', deviceClass: 'Relay Actuator', icon: 'ToggleRight', channels: 12, channelCurrentA: 16, busCurrentMa: 25, actuator: true, name: { ar: 'وحدة ريليه HDL', en: 'HDL Relay Actuator', ku: 'ڕیلێی HDL', tr: 'HDL Röle Aktüatör' } },
  { id: 'dimmer', deviceClass: 'Dimmer', icon: 'SlidersHorizontal', channels: 6, channelCurrentA: 2, busCurrentMa: 30, actuator: true, name: { ar: 'وحدة دمر HDL', en: 'HDL Dimmer', ku: 'دیمەری HDL', tr: 'HDL Dimmer' } },
  { id: 'curtain', deviceClass: 'Curtain Controller', icon: 'Blinds', channels: 4, channelCurrentA: 3, busCurrentMa: 25, actuator: true, name: { ar: 'متحكم ستائر HDL', en: 'HDL Curtain Controller', ku: 'کۆنتڕۆڵی پەردە HDL', tr: 'HDL Perde Kontrol' } },
  { id: 'drycontact', deviceClass: 'Dry Contact', icon: 'Cable', channels: 8, channelCurrentA: 0.5, busCurrentMa: 20, actuator: true, name: { ar: 'وحدة دراي كونتاكت HDL', en: 'HDL Dry Contact', ku: 'درای کۆنتاکتی HDL', tr: 'HDL Kuru Kontak' } },
  { id: 'input', deviceClass: 'Binary Input', icon: 'SquareMousePointer', channels: 8, channelCurrentA: null, busCurrentMa: 15, actuator: false, name: { ar: 'مدخل ثنائي HDL', en: 'HDL Binary Input', ku: 'هاتنی دووانی HDL', tr: 'HDL İkili Giriş' } },
  { id: 'dlp', deviceClass: 'DLP Panel', icon: 'PanelTop', channels: 0, channelCurrentA: null, busCurrentMa: 30, actuator: false, name: { ar: 'لوحة DLP HDL', en: 'HDL DLP Panel', ku: 'پانێلی DLP HDL', tr: 'HDL DLP Panel' } },
  { id: 'touchscreen', deviceClass: 'Touchscreen', icon: 'TabletSmartphone', channels: 0, channelCurrentA: null, busCurrentMa: 50, actuator: false, name: { ar: 'شاشة لمس HDL', en: 'HDL Touchscreen', ku: 'شاشەی پاڵنەری HDL', tr: 'HDL Dokunmatik' } },
  { id: 'hcu', deviceClass: 'Home Control Unit', icon: 'Cpu', channels: 0, channelCurrentA: null, busCurrentMa: 60, actuator: false, name: { ar: 'وحدة تحكم منزلية HDL', en: 'HDL Home Control Unit', ku: 'یەکەی کۆنتڕۆڵی ماڵ HDL', tr: 'HDL Ev Kontrol Ünitesi' } },
  { id: 'logic', deviceClass: 'Logic Module', icon: 'GitBranch', channels: 0, channelCurrentA: null, busCurrentMa: 25, actuator: false, name: { ar: 'وحدة منطق HDL', en: 'HDL Logic Module', ku: 'مۆدیوڵی لۆجیک HDL', tr: 'HDL Mantık Modülü' } },
  { id: 'hvacctrl', deviceClass: 'HVAC Controller', icon: 'AirVent', channels: 0, channelCurrentA: null, busCurrentMa: 30, actuator: false, name: { ar: 'متحكم تكييف HDL', en: 'HDL HVAC Controller', ku: 'کۆنتڕۆڵی HVAC HDL', tr: 'HDL HVAC Kontrol' } },
  { id: 'gateway', deviceClass: 'Gateway', icon: 'Router', channels: 0, channelCurrentA: null, busCurrentMa: 40, actuator: false, name: { ar: 'بوابة HDL', en: 'HDL Gateway', ku: 'دەروازەی HDL', tr: 'HDL Ağ Geçidi' } },
  { id: 'iprouter', deviceClass: 'IP Router', icon: 'Network', channels: 0, channelCurrentA: null, busCurrentMa: 45, actuator: false, name: { ar: 'راوتر IP HDL', en: 'HDL IP Router', ku: 'ڕاوتەری IP HDL', tr: 'HDL IP Router' } },
  { id: 'scene', deviceClass: 'Scene Panel', icon: 'LayoutPanelLeft', channels: 0, channelCurrentA: null, busCurrentMa: 20, actuator: false, name: { ar: 'لوحة مشاهد HDL', en: 'HDL Scene Panel', ku: 'پانێلی سیناریۆ HDL', tr: 'HDL Senaryo Paneli' } },
  { id: 'sensor', deviceClass: 'Smart Sensor', icon: 'Radar', channels: 0, channelCurrentA: null, busCurrentMa: 15, actuator: false, name: { ar: 'حساس ذكي HDL', en: 'HDL Smart Sensor', ku: 'هەستەوەری زیرەک HDL', tr: 'HDL Akıllı Sensör' } },
  { id: 'hotel', deviceClass: 'Hotel Panel', icon: 'BedDouble', channels: 0, channelCurrentA: null, busCurrentMa: 35, actuator: false, name: { ar: 'لوحة فندقية HDL', en: 'HDL Hotel Panel', ku: 'پانێلی هۆتێل HDL', tr: 'HDL Otel Paneli' } },
  { id: 'ir', deviceClass: 'IR Controller', icon: 'Rss', channels: 0, channelCurrentA: null, busCurrentMa: 20, actuator: false, name: { ar: 'متحكم IR HDL', en: 'HDL IR Controller', ku: 'کۆنتڕۆڵی IR HDL', tr: 'HDL IR Kontrol' } },
];

/* ------------------------------- KNX --------------------------------- */
const knxSeeds: Seed[] = [
  { id: 'buspsu', deviceClass: 'Bus PSU', icon: 'Zap', channels: 0, channelCurrentA: null, busCurrentMa: 0, busSupplyMa: 640, actuator: false, name: { ar: 'مزود طاقة KNX 640mA', en: 'KNX Bus PSU 640mA', ku: 'PSU باز KNX 640mA', tr: 'KNX Veri Yolu PSU 640mA' } },
  { id: 'actuator', deviceClass: 'Switch Actuator', icon: 'ToggleRight', channels: 8, channelCurrentA: 16, busCurrentMa: 12, actuator: true, name: { ar: 'مشغل KNX', en: 'KNX Switch Actuator', ku: 'ئەکچوەیتەری KNX', tr: 'KNX Anahtarlama Aktüatör' } },
  { id: 'dimmer', deviceClass: 'Dimmer Actuator', icon: 'SlidersHorizontal', channels: 4, channelCurrentA: 1.5, busCurrentMa: 15, actuator: true, name: { ar: 'دمر KNX', en: 'KNX Dimmer', ku: 'دیمەری KNX', tr: 'KNX Dimmer' } },
  { id: 'touch', deviceClass: 'Touch Panel', icon: 'TabletSmartphone', channels: 0, channelCurrentA: null, busCurrentMa: 20, actuator: false, name: { ar: 'لوحة لمس KNX', en: 'KNX Touch Panel', ku: 'پانێلی پاڵنەری KNX', tr: 'KNX Dokunmatik Panel' } },
  { id: 'input', deviceClass: 'Binary Input', icon: 'SquareMousePointer', channels: 6, channelCurrentA: null, busCurrentMa: 8, actuator: false, name: { ar: 'مدخل ثنائي KNX', en: 'KNX Binary Input', ku: 'هاتنی دووانی KNX', tr: 'KNX İkili Giriş' } },
  { id: 'presence', deviceClass: 'Presence Sensor', icon: 'UserCheck', channels: 0, channelCurrentA: null, busCurrentMa: 10, actuator: false, name: { ar: 'حساس تواجد KNX', en: 'KNX Presence Sensor', ku: 'هەستەوەری ئامادەبوون KNX', tr: 'KNX Varlık Sensörü' } },
  { id: 'weather', deviceClass: 'Weather Station', icon: 'CloudSun', channels: 0, channelCurrentA: null, busCurrentMa: 25, actuator: false, name: { ar: 'محطة طقس KNX', en: 'KNX Weather Station', ku: 'وێستگەی کەشوهەوای KNX', tr: 'KNX Hava İstasyonu' } },
  { id: 'fcuctrl', deviceClass: 'Fan Coil Controller', icon: 'Fan', channels: 3, channelCurrentA: 6, busCurrentMa: 18, actuator: true, name: { ar: 'متحكم فان كويل KNX', en: 'KNX Fan Coil Controller', ku: 'کۆنتڕۆڵی فان کۆیل KNX', tr: 'KNX Fan Coil Kontrol' } },
  { id: 'heating', deviceClass: 'Heating Controller', icon: 'Flame', channels: 6, channelCurrentA: 0.5, busCurrentMa: 15, actuator: true, name: { ar: 'متحكم تدفئة KNX', en: 'KNX Heating Controller', ku: 'کۆنتڕۆڵی گەرمکردن KNX', tr: 'KNX Isıtma Kontrol' } },
  { id: 'logic', deviceClass: 'Logic Controller', icon: 'GitBranch', channels: 0, channelCurrentA: null, busCurrentMa: 20, actuator: false, name: { ar: 'متحكم منطق KNX', en: 'KNX Logic Controller', ku: 'کۆنتڕۆڵی لۆجیک KNX', tr: 'KNX Mantık Kontrol' } },
  { id: 'gateway', deviceClass: 'Gateway', icon: 'Router', channels: 0, channelCurrentA: null, busCurrentMa: 30, actuator: false, name: { ar: 'بوابة KNX', en: 'KNX Gateway', ku: 'دەروازەی KNX', tr: 'KNX Ağ Geçidi' } },
  { id: 'iprouter', deviceClass: 'IP Router', icon: 'Network', channels: 0, channelCurrentA: null, busCurrentMa: 35, actuator: false, name: { ar: 'راوتر IP KNX', en: 'KNX IP Router', ku: 'ڕاوتەری IP KNX', tr: 'KNX IP Router' } },
];

function build(protocol: SmartHomeSpec['protocol'], seeds: Seed[]): SmartHomeSpec[] {
  return seeds.map((s) => ({
    id: `${protocol.toLowerCase()}-${s.id}`,
    domain: 'smarthome',
    category: protocol,
    name: s.name,
    manufacturer: protocol === 'HDL' ? 'HDL Automation' : 'ABB',
    model: `${protocol}-${s.id.toUpperCase()}`,
    standards: protocol === 'KNX' ? ['KNX'] : [],
    ports: s.actuator ? actuatorPorts : busPort,
    icon: s.icon,
    color: protocol === 'HDL' ? '#f43f5e' : '#22c55e',
    protocol,
    deviceClass: s.deviceClass,
    channels: s.channels,
    channelCurrentA: s.channelCurrentA,
    busCurrentMa: s.busCurrentMa,
    busSupplyMa: s.busSupplyMa,
    voltage: protocol === 'HDL' ? 24 : 30,
  }));
}

export const SMART_HOME: SmartHomeSpec[] = [
  ...build('HDL', hdlSeeds),
  ...build('KNX', knxSeeds),
];
