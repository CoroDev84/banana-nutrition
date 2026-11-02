// Convert consumed nutrition into reusable nutrition for one serving.
export function buildSavedProduct(entry) {
  const barcode = String(entry.barcodeSnapshot || "").replace(/\s+/g, "");
  if (!/^[0-9]{8,14}$/.test(barcode)) throw new Error("Enter an 8–14 digit barcode to save a correction.");
  const name = entry.foodNameSnapshot.trim();
  const servingLabel = (entry.servingLabel || "").trim();
  if (!name || !servingLabel) throw new Error("Enter a food name and a serving measure, such as 1 pouch (250 g).");
  const multiplier = Number(entry.servingMultiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Enter a serving multiplier greater than zero.");
  const perServing = value => {
    if (value === null || value === undefined || value === "") throw new Error("Enter calories and all three macros; use 0 when the label says zero.");
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Nutrition values must be zero or greater.");
    return amount / multiplier;
  };
  const product = {
    name, brand: entry.brandSnapshot || null,
    servingSize: entry.servingSize, servingUnit: entry.servingUnit,
    servingLabel, nutrients: {},
  };
  for (const key of ["calories", "protein", "carbs", "fat"]) product[key] = perServing(entry[key]);
  for (const [key, value] of Object.entries(entry.nutrients || {})) {
    if (value !== null && value !== undefined && value !== "") product.nutrients[key] = perServing(value);
  }
  return { barcode, product };
}
