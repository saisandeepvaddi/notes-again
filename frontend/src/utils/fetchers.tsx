export const getFetcher = async (options: Parameters<typeof fetch>) => {
  return await fetch(...options);
};
