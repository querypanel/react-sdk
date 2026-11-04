import type { Meta, StoryObj } from "@storybook/react";
import { VizSpecMap, type MapSpec, type ResolvePlaces } from "./VizSpecMap";
import type { MapTopology } from "./vizSpecMapGeometry";
import hungary from "./fixtures/hungary.topo.json";
import { defaultColors, getColorsForMode } from "../themes";

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

// Osc App-shaped: 26 chambers, Hungarian postal codes and towns, one `Cloud` that cannot be placed.
const TOWNS: Record<string, [number, number, string]> = {
  "1011": [47.498, 19.04, "Budapest"],
  "4025": [47.5316, 21.6273, "Debrecen"],
  "6720": [46.253, 20.1414, "Szeged"],
  "7133": [46.465, 18.819, "Fadd"],
  "9021": [47.6875, 17.6504, "Győr"],
  "3525": [48.1035, 20.7784, "Miskolc"],
  "4400": [47.9554, 21.7167, "Nyíregyháza"],
  "6000": [46.8964, 19.6897, "Kecskemét"],
  "7621": [46.0727, 18.2323, "Pécs"],
  "8000": [47.1914, 18.4101, "Székesfehérvár"],
};
const TOWN_BY_NAME = new Map(Object.values(TOWNS).map(([lat, lng, name]) => [name.toLowerCase(), { lat, lng, name }]));

/** Stand-in for `POST /geo/resolve`: postal code first, then town name. */
const fakeResolvePlaces: ResolvePlaces = async (_country, places) =>
  places.map((place) => {
    const byPostal = place.postalCode ? TOWNS[place.postalCode] : undefined;
    if (byPostal) return { lat: byPostal[0], lng: byPostal[1], resolvedName: byPostal[2], matchedBy: "postal" as const };
    const byCity = place.city ? TOWN_BY_NAME.get(place.city.toLowerCase()) : undefined;
    return byCity ? { lat: byCity.lat, lng: byCity.lng, resolvedName: byCity.name, matchedBy: "city" as const } : null;
  });

const chamberAddresses = ["1011", "4025", "6720", "7133", "9021", "3525", "4400", "6000", "7621", "8000"];
const chambers = [
  ...Array.from({ length: 17 }, (_, i) => {
    const postal = chamberAddresses[i % chamberAddresses.length] as string;
    return { chamber: `chamber-${i + 1}`, postal_code: postal, city: TOWNS[postal]?.[2] ?? null };
  }),
  // No postal code in the address: falls back to the town name.
  ...["Szeged", "Debrecen", "Győr", "Pécs", "Miskolc", "Kecskemét", "Budapest", "Fadd"].map((city, i) => ({
    chamber: `chamber-${18 + i}`,
    postal_code: null,
    city,
  })),
  { chamber: "chamber-26", postal_code: null, city: "Cloud" },
];

export const PlaceMode: Story = {
  args: {
    spec: {
      ...spec,
      title: "Chambers in Hungary",
      encoding: {
        ...spec.encoding,
        location: { mode: "place", postalCodeField: "postal_code", cityField: "city", latField: null, lngField: null },
        labelField: "chamber",
      },
    },
    data: chambers,
    resolvePlaces: fakeResolvePlaces,
  },
};

// Markers: donut per place, split by status. Light/dark use getColorsForMode like the host app does.
const lightColors = getColorsForMode(defaultColors, false);
const markerSpec: MapSpec = {
  ...spec,
  title: "Devices by status",
  encoding: { ...spec.encoding, colorField: "status", labelField: "device", tooltips: ["firmware"] },
};
const statuses = ["active", "Active", "idle", "offline", "unknown", null];
const mixedRows = rows.flatMap((r, i) =>
  Array.from({ length: (i % 4) * 2 + 1 }, (_, j) => ({
    ...r,
    device: `${r.city}-${j + 1}`,
    status: statuses[(i + j) % statuses.length],
    firmware: `v1.${j}`,
  })),
);
const withData = (data: Array<Record<string, unknown>>, encoding: Partial<MapSpec["encoding"]> = {}) => ({
  spec: { ...markerSpec, encoding: { ...markerSpec.encoding, ...encoding } },
  data,
});

export const MixedStatuses: Story = { args: withData(mixedRows) };
export const MixedStatusesLight: Story = { args: { ...withData(mixedRows), colors: lightColors } };

const singleStatusRows = mixedRows.map((r) => ({ ...r, status: "Online" }));
export const SingleStatus: Story = { args: withData(singleStatusRows) };
export const SingleStatusLight: Story = { args: { ...withData(singleStatusRows), colors: lightColors } };

const plans = ["gold", "silver", "bronze", "trial"];
const customRows = mixedRows.map((r, i) => ({ ...r, status: plans[i % plans.length] }));
export const CustomValues: Story = { args: withData(customRows) };
export const CustomValuesLight: Story = { args: { ...withData(customRows), colors: lightColors } };

export const NoColorColumn: Story = { args: withData(mixedRows, { colorField: null }) };
