// src/three/Managers/DebugManager.ts
import type { Group } from 'three';

// Stílusok a konzol üzenetekhez
const ERROR_STYLE = 'background: #ff4757; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;';
const WARN_STYLE = 'background: #ffa502; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;';
const ACTION_STYLE = 'background: #2e86de; color: white; padding: 2px 6px; border-radius: 3px;';
const STATE_STYLE = 'background: #444; color: #f1f2f6; padding: 2px 6px; border-radius: 3px;';
const CONTEXT_STYLE = 'font-family: monospace; color: #576574;';

// Singleton minta
let instance: DebugManager | null = null;

class DebugManager {
  // JAVÍTÁS: A konstruktor privát és nem függ semmitől
  private constructor() {}

  // Statikus metódus a példány elérésére
  public static getInstance(): DebugManager {
    if (!instance) {
      instance = new DebugManager();
    }
    return instance;
  }

  // A többi metódus változatlan, mivel nem használtak semmilyen belső állapotot.
  public logSeparator(title = '') {
    console.log(`%c--- ${title} ---`, 'color: #7f8c8d; font-weight: bold;');
  }

  public logAction(name: string, details: Record<string, unknown> = {}) {
    console.group(`%cAKCIÓ%c ${name}`, ACTION_STYLE, '');
    console.log('Paraméterek:', details);
    console.groupEnd();
  }

  public logObjectState(message: string, object: Group) {
    console.group(`%cÁLLAPOT%c ${message} (UUID: ${object.uuid.substring(0, 6)})`, STATE_STYLE, '');
    try {
      console.log('componentState:', JSON.parse(JSON.stringify(object.userData.componentState || {})));
      console.log('materialState:', JSON.parse(JSON.stringify(object.userData.materialState || {})));
    } catch (e) {
      console.error('Hiba a userData logolása közben:', e);
      console.log('Sérült userData:', object.userData);
    }
    console.groupEnd();
  }

  public logModelLoadError(url: string, error: unknown) {
    console.groupCollapsed(`%cHIBA%c Modell betöltése sikertelen`, ERROR_STYLE, '');
    console.log(`A GLTFLoader nem tudta betölteni vagy feldolgozni a modellt.`);
    console.log(`%cURL:%c ${url}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cOk:%c Valószínűleg hibás az elérési út (404-es hiba), vagy a .glb fájl sérült.`, 'font-weight: bold;', '');
    console.log(`%cEredeti hiba:%c`, 'font-weight: bold;', '');
    console.error(error);
    console.groupEnd();
  }

  public logAttachmentPointNotFound(pointName: string, baseComponentName: string, componentToAttachName: string) {
    console.groupCollapsed(`%cFIGYELMEZTETÉS%c Csatlakozási pont nem található`, WARN_STYLE, '');
    console.log(`A(z) %c${componentToAttachName}%c komponenst nem lehetett csatlakoztatni.`, 'font-weight: bold;', '');
    console.log(`%cKeresett pont:%c ${pointName}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cBázis modellen:%c ${baseComponentName}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cOk:%c Ellenőrizd, hogy a(z) "${baseComponentName}" modell tartalmaz-e egy "${pointName}" nevű dummy objektumot.`, 'font-weight: bold;', '');
    console.groupEnd();
  }

  public logConfigNotFound(type: 'Bútor' | 'Komponens', id: string) {
    console.warn(`%cFIGYELMEZTETÉS%c ${type} konfiguráció nem található a(z) %c"${id}"%c ID-val. Ellenőrizd a JSON fájlokat.`, WARN_STYLE, '', CONTEXT_STYLE, '');
  }

  public logWarning(message: string, context: unknown = '') {
    console.warn(`%cFIGYELEM%c ${message}`, WARN_STYLE, '', context);
  }
}

// JAVÍTÁS: A singleton példányt exportáljuk alapértelmezetten
export default DebugManager;