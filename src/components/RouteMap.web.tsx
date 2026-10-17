import React, { useMemo, useRef, useEffect } from "react";
import { View } from "react-native";
import { MapProps, mapHTML } from "./mapDocument";
export default function RouteMap(props: MapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const html = useMemo(
    () => mapHTML({ ...props, driver: null }),
    [
      props.pickup.lat,
      props.pickup.lng,
      props.destination?.lat,
      props.destination?.lng,
      props.route,
    ],
  );
  const update = () => {
    if (props.driver)
      ref.current?.contentWindow?.postMessage(
        { type: "driver", point: props.driver },
        "*",
      );
  };
  useEffect(update, [props.driver]);
  return (
    <View
      style={{
        height: props.height || 260,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "#e6ede6",
      }}
    >
      <iframe
        ref={ref}
        title="Mapa de Bariloche · OpenStreetMap"
        srcDoc={html}
        onLoad={update}
        sandbox="allow-scripts allow-popups"
        style={{ border: 0, width: "100%", height: "100%" }}
      />
    </View>
  );
}
