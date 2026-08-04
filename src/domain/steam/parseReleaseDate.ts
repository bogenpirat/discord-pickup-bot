const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const PATTERN = /^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})$/;

export const parseSteamReleaseDate = (text: string): Temporal.PlainDate | null => {
  const match = PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  const month = MONTHS[(monthText as string).toLowerCase()];
  if (month === undefined) {
    return null;
  }

  try {
    return Temporal.PlainDate.from(
      {
        year: Number(yearText),
        month,
        day: Number(dayText),
      },
      { overflow: 'reject' },
    );
  } catch {
    return null;
  }
};
