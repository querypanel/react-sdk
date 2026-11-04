import type { Meta, StoryObj } from "@storybook/react";
import { VizSpecMap, type MapSpec } from "./VizSpecMap";
import type { MapTopology } from "./vizSpecMapGeometry";
import hungary from "./fixtures/hungary.topo.json";
import { defaultColors } from "../themes";

const hungaryTopology = hungary as unknown as MapTopology;

const spec: MapSpec = {
  kind: "map",
  title: "Offices in Hungary",
  encoding: {
    location: { mode: "latlng", postalCodeField: null, cityField: null, latField: "lat", lngField: "lng" },
    country: "HU",
    colorField: null,
    labelField: "city",
    tooltips: null,
  },
};

const rows = [
  { city: "Budapest", lat: 47.4979, lng: 19.0402 },
  { city: "Debrecen", lat: 47.5316, lng: 21.6273 },
  { city: "Szeged", lat: 46.253, lng: 20.1414 },
  { city: "Pecs", lat: 46.0727, lng: 18.2323 },
  { city: "Gyor", lat: 47.6875, lng: 17.6504 },
  { city: "Miskolc", lat: 48.1035, lng: 20.7784 },
  { city: "Nyiregyhaza", lat: 47.9554, lng: 21.7167 },
  { city: "Kecskemet", lat: 46.8964, lng: 19.6897 },
];

const meta: Meta<typeof VizSpecMap> = {
  title: "Components/VizSpecMap",
  component: VizSpecMap,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Map kind: a country outline (d3-geo, SVG) with one dot per row from lat/lng columns. Boundaries are supplied by the host via `boundaries` or `fetchBoundaries`.",
      },
    },
  },
  args: { spec, data: rows, colors: defaultColors, boundaries: hungaryTopology },
};

export default meta;
type Story = StoryObj<typeof VizSpecMap>;

export const Hungary: Story = {};

export const SkipsInvalidRows: Story = {
  args: { data: [...rows, { city: "Nowhere", lat: null, lng: "n/a" }, { city: "Out of range", lat: 120, lng: 19 }] },
};

export const PlaceModePending: Story = {
  args: {
    spec: { ...spec, encoding: { ...spec.encoding, location: { ...spec.encoding.location, mode: "place", cityField: "city", latField: null, lngField: null } } },
  },
};
