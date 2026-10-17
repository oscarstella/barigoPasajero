import React, { useMemo, useRef, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { MapProps, mapHTML } from "./mapDocument";
export default function RouteMap(props: MapProps) {
  const ref = useRef<WebView<{}>>(null);
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
  useEffect(() => {
    if (props.driver)
      ref.current?.postMessage(
        JSON.stringify({ type: "driver", point: props.driver }),
      );
  }, [props.driver]);
  const [failed, setFailed] = React.useState(false);
  return (
    <View style={[styles.frame, { height: props.height || 260 }]}>
      {failed ? (
        <Text style={styles.error}>
          No se pudo cargar el mapa. Revisá tu conexión.
        </Text>
      ) : (
        <WebView<{}>
          ref={ref}
          source={{ html, baseUrl: "https://barigo.local" }}
          originWhitelist={["https://*", "about:*"]}
          javaScriptEnabled
          scrollEnabled={false}
          onError={() => setFailed(true)}
          onLoadEnd={() => {
            if (props.driver)
              ref.current?.postMessage(
                JSON.stringify({ type: "driver", point: props.driver }),
              );
          }}
          style={{ flex: 1, backgroundColor: "#e6ede6" }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 24, backgroundColor: "#e6ede6" },
  error: { padding: 24, color: "#143e35" },
});
