/**
 * Arithmetic of the event budget planner. Used by the planner screen (live, as
 * the trustee types), and by the PDF and Excel exports, so all three always
 * agree. Pure functions; amounts are rupees.
 */

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s₹]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** qty x rate, times the head-count when the line is "per person". */
export function lineTotal(item, attendees) {
  return Math.round(num(item.qty === '' || item.qty === undefined ? 1 : item.qty) * num(item.unit_amount) * (item.per_head ? num(attendees) : 1) * 100) / 100;
}

export function planTotals(plan) {
  const attendees = Math.max(0, Math.floor(num(plan.expected_attendees)));
  const fee = Math.max(0, num(plan.entry_fee));
  const items = Array.isArray(plan.items) ? plan.items : [];

  const entryIncome = attendees * fee;
  const otherIncome = items.filter((i) => i.kind === 'income').reduce((sum, i) => sum + lineTotal(i, attendees), 0);
  const expense = items.filter((i) => i.kind === 'expense').reduce((sum, i) => sum + lineTotal(i, attendees), 0);
  const income = entryIncome + otherIncome;
  const balance = income - expense;

  // Costs that grow with every person, and those that do not.
  const perHeadCost = items.filter((i) => i.kind === 'expense' && i.per_head).reduce((sum, i) => sum + num(i.qty || 1) * num(i.unit_amount), 0);
  const fixedCost = expense - perHeadCost * attendees;
  const perHeadIncome = fee + items.filter((i) => i.kind === 'income' && i.per_head).reduce((sum, i) => sum + num(i.qty || 1) * num(i.unit_amount), 0);
  const fixedIncome = income - perHeadIncome * attendees;

  // How many people must come for the event to pay for itself.
  const margin = perHeadIncome - perHeadCost;
  const gap = fixedCost - fixedIncome;
  let breakEven = null;
  if (gap <= 0) breakEven = 0;
  else if (margin > 0) breakEven = Math.ceil(gap / margin);

  // The entry fee at which the planned head-count exactly covers the cost.
  const feeToCover = attendees > 0 ? Math.max(0, Math.ceil((expense - otherIncome) / attendees)) : null;

  return {
    attendees, fee, entryIncome, otherIncome, income, expense, balance,
    costPerHead: attendees > 0 ? expense / attendees : null,
    breakEven, feeToCover,
  };
}
