declare module "osmtogeojson" {
  // We only ever feed it Overpass OSM JSON and read the resulting FeatureCollection.
  const osmtogeojson: (data: unknown, options?: unknown) => {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      id?: string | number;
      properties?: Record<string, unknown> | null;
      geometry: {
        type: string;
        coordinates: unknown;
      } | null;
    }>;
  };
  export default osmtogeojson;
}
