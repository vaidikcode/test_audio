import { app } from "./app.js";

const PORT = Number(process.env.PORT || 8788);

app.listen(PORT, () => {
  console.log(`Mirelo proxy listening on http://127.0.0.1:${PORT}`);
});
