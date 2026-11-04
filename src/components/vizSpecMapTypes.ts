// Mirrors the VizSpec map types of @querypanel/node-sdk. The react-sdk does not depend on node-sdk, so the
// shapes are copied here: keep them in sync with the node-sdk map spec when that changes.
export interface MapLocation {
  mode: "place" | "latlng";
  postalCodeField: string | null;
  cityField: string | null;
  latField: string | null;
  lngField: string | null;
}

export interface MapEncoding {
  location: MapLocation;
  country: string;
  colorField: string | null;
  labelField: string | null;
  tooltips: string[] | null;
}

export interface MapSpec {
  kind: "map";
  title?: string;
  description?: string;
  encoding: MapEncoding;
}
