import { leafletJS, leafletCSS } from "./leafletAssets";
export type MapPoint = { lat: number; lng: number; label?: string };
export type MapProps = {
  pickup: MapPoint;
  destination?: MapPoint | null;
  driver?: MapPoint | null;
  route?: number[][] | null;
  height?: number;
};
const jsJSON = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
export function mapHTML({ pickup, destination, driver, route }: MapProps) {
  const config = jsJSON({
    pickup,
    destination,
    driver,
    route,
    tileURL:
      process.env.EXPO_PUBLIC_TILE_URL ||
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>${leafletCSS}\nhtml,body,#map{height:100%;width:100%;margin:0;background:#e6ede6} .leaflet-control-attribution{font:9px sans-serif!important}.leaflet-control-attribution a{color:#164d40}.pin{border:3px solid #fff;border-radius:50%;background:#164d40;width:14px!important;height:14px!important;box-shadow:0 2px 5px #0004}.end{background:#bbdf4e}.car{font-size:19px;border-radius:12px;background:#143e35;color:#fff;padding:5px;width:26px!important;height:26px!important;text-align:center;box-shadow:0 2px 5px #0004}.leaflet-container{font-family:Arial,sans-serif}#error{position:absolute;bottom:22px;left:8px;right:8px;background:#fff;padding:7px;border-radius:6px;font:11px sans-serif;z-index:1000;display:none}</style></head><body><div id="map" aria-label="Mapa de Bariloche"></div><div id="error">El mapa no pudo cargar. Revisá tu conexión.</div><script>${leafletJS.replace(/<\/script/gi, "<\\/script")}</script><script>
const data=${config};const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([data.pickup.lat,data.pickup.lng],13);let failures=0;const layer=L.tileLayer(data.tileURL,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',crossOrigin:true}).addTo(map);layer.on('tileerror',()=>{if(++failures>2)document.getElementById('error').style.display='block';});layer.on('tileload',()=>{document.getElementById('error').style.display='none';window.parent.postMessage({type:'barigo:tile-loaded'},'*');if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('tile-loaded');});
function mark(p,kind){return L.marker([p.lat,p.lng],{icon:L.divIcon({className:kind==='driver'?'car':('pin '+(kind==='end'?'end':'')),html:kind==='driver'?'&#8593;':'',iconSize:kind==='driver'?[36,36]:[20,20]})}).addTo(map);}
mark(data.pickup,'start');if(data.destination)mark(data.destination,'end');let car=data.driver?mark(data.driver,'driver'):null;
if(data.route&&data.route.length>1){const line=L.polyline(data.route.map(c=>[c[1],c[0]]),{color:'#164d40',weight:5,opacity:.9}).addTo(map);map.fitBounds(line.getBounds(),{padding:[34,34]});}else if(data.destination){map.fitBounds([[data.pickup.lat,data.pickup.lng],[data.destination.lat,data.destination.lng]],{padding:[34,34]});}
function updateDriver(value){try{const msg=typeof value==='string'?JSON.parse(value):value;if(msg.type==='driver'&&msg.point){if(car)car.setLatLng([msg.point.lat,msg.point.lng]);else car=mark(msg.point,'driver');}}catch{}}
window.addEventListener('message',e=>updateDriver(e.data));document.addEventListener('message',e=>updateDriver(e.data));setTimeout(()=>map.invalidateSize(),150);
</script></body></html>`;
}
