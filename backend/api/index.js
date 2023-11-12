const { default: axios } = require("axios");
const url =
  "http://localhost:8080/api/product-transactions-statistics-barChart-pieChart/1";
const baseUrl = "https://product-transactions.onrender.com/api";
async function getDataFromApi() {
  try {
    // const res = await axios.get(baseUrl + "/transactions");
    const res = await fetch(url);
    const data = await res;
    return data;
  } catch (error) {
    console.log(error);
  }
}

getDataFromApi()
  .then((res) => console.log(res, 22))
  .catch((E) => console.log(E));
