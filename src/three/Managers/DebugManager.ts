// src/three/Managers/DebugManager.ts

import Experience from '../Experience';

// Stílusok a konzol üzenetekhez
const ERROR_STYLE = 'background: #ff4757; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;';
const WARN_STYLE = 'background: #ffa502; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;';
//const INFO_STYLE = 'background: #2e86de; color: white; padding: 2px 6px; border-radius: 3px;';
const CONTEXT_STYLE = 'font-family: monospace; color: #576574;';

export default class DebugManager {
  constructor(private experience: Experience) {}

  /**
   * Akkor hívódik, ha egy 3D modell betöltése hálózati vagy parse-olási hiba miatt meghiúsul.
   * @param url A sikertelenül betöltött modell URL-je.
   * @param error A betöltő által dobott eredeti hiba.
   */
    public logModelLoadError(url: string, error: unknown) {
    console.groupCollapsed(`%cHIBA%c Modell betöltése sikertelen`, ERROR_STYLE, '');
    console.log(`A GLTFLoader nem tudta betölteni vagy feldolgozni a modellt.`);
    console.log(`%cURL:%c ${url}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cOk:%c Valószínűleg hibás az elérési út (404-es hiba), vagy a .glb fájl sérült.`, 'font-weight: bold;', '');
    console.log(`%cEredeti hiba:%c`, 'font-weight: bold;', '');
    console.error(error);
    console.groupEnd();
  }

  /**
   * Akkor hívódik, ha egy bútor összeszerelésekor nem található egy csatlakozási pont (dummy).
   * @param pointName A keresett dummy objektum neve.
   * @param baseComponentName Annak a komponensnek a neve, AMIN kerestük a pontot (pl. korpusz).
   * @param componentToAttachName Annak a komponensnek a neve, AMIT csatlakoztatni akartunk (pl. fogantyú).
   */
  public logAttachmentPointNotFound(pointName: string, baseComponentName: string, componentToAttachName: string) {
    console.groupCollapsed(`%cFIGYELMEZTETÉS%c Csatlakozási pont nem található`, WARN_STYLE, '');
    console.log(`A(z) %c${componentToAttachName}%c komponenst nem lehetett csatlakoztatni.`, 'font-weight: bold;', '');
    console.log(`%cKeresett pont:%c ${pointName}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cBázis modellen:%c ${baseComponentName}`, 'font-weight: bold;', CONTEXT_STYLE);
    console.log(`%cOk:%c Ellenőrizd, hogy a(z) "${baseComponentName}" modell tartalmaz-e egy "${pointName}" nevű dummy objektumot.`, 'font-weight: bold;', '');
    console.groupEnd();
  }

  /**
   * Akkor hívódik, ha egy komponens vagy bútor configot nem talál az ID alapján.
   * @param type 'Bútor' vagy 'Komponens'.
   * @param id A keresett ID.
   */
  public logConfigNotFound(type: 'Bútor' | 'Komponens', id: string) {
    console.warn(`%cFIGYELMEZTETÉS%c ${type} konfiguráció nem található a(z) %c"${id}"%c ID-val. Ellenőrizd a JSON fájlokat.`, WARN_STYLE, '', CONTEXT_STYLE, '');
  }
}