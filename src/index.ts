import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

(async () => {
  const collectionId = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
  const ownerList: [] = [];
  let moreOwners = true;
  while (moreOwners) {
    const {
      data: { owners },
    } = await axios.get(
      `https://api.reservoir.tools/owners/v1?collection=${collectionId}&limit=500&offset=${ownerList.length}`,
      {
        headers: {
          "x-api-key": `${process.env.RESERVOIR_KEY}`,
        },
      }
    );
    const tempList: [] = owners;
    if (tempList.length === 0) {
      moreOwners = false;
      break;
    }
    ownerList.push(...tempList);
  }

  console.log("Owner fetch complete");

  let i = 0;

  const ownerLoop = async (resolve, reject) => {
    try {
      if (i > ownerList.length) {
        return resolve;
      }

      let moreBids = true;
      let continuation: string | undefined;
      let numberOfBids: number = 0;
      const bidList: [] = [];

      while (moreBids) {
        const url = `https://api.reservoir.tools/orders/users/${
          ownerList[i]["address"]
        }/top-bids/v3?sortBy=topBidValue&sortDirection=desc&limit=100&collection=${collectionId}${
          continuation ? "&continuation=" + continuation : ""
        }
    `;
        const { data } = await axios.get(url, {
          headers: {
            "x-api-key": `${process.env.RESERVOIR_KEY}`,
          },
        });
        const topBids = data.topBids;
        const tempArray: [] = topBids.map((obj) => ({
          ...obj,
          owner: ownerList[i]["address"],
        }));
        bidList.push(...tempArray);
        if (!data.continuation) {
          numberOfBids = data.totalTokensWithBids;
          moreBids = false;
          break;
        }
        continuation = data.continuation;
      }

      console.log(
        `Bid fetch complete, found ${numberOfBids} tokens with bids for ${ownerList[i]["address"]}`
      );
      console.log("Starting sell api test on the user's tokens...");

      async function testFunc(index: number) {
        try {
          await axios.post(
            "https://api.reservoir.tools/execute/sell/v6",
            {
              onlyPath: false,
              normalizeRoyalties: false,
              token: `${collectionId}:${bidList[index]["token"]["tokenId"]}`,
              taker: bidList[index]["owner"],
            },
            {
              headers: {
                "x-api-key": `${process.env.RESERVOIR_KEY}`,
              },
            }
          );
          const {
            data: { message },
          } = await axios.post(
            "https://api.reservoir.tools/tokens/simulate-top-bid/v1",
            {
              token: `${collectionId}:${bidList[index]["token"]["tokenId"]}`,
            },
            {
              headers: {
                "x-api-key": `${process.env.RESERVOIR_KEY}`,
              },
            }
          );
          if (message !== "Top bid order is fillable") {
            console.log(
              `Error for token #${bidList[index]["token"]["tokenId"]}: ${message}`
            );
          }
        } catch (err: any) {
          console.log(
            `Error for token #${bidList[index]["token"]["tokenId"]}: ${err.response.data.message}`
          );
        }

        if (index + 1 === bidList.length) {
          console.log(
            "\nFinished checking current user's tokens, proceeding to the next one..."
          );
          i++;
          setTimeout(ownerLoop, 1000, resolve, reject);
        }
      }

      let j = 0;
      const callInterval = setInterval(() => {
        if (j < bidList.length) {
          testFunc(j);
          j++;
        } else if (j >= bidList.length) {
          clearInterval(callInterval);
        }
      }, 500);
    } catch (err) {
      console.log(
        `Error fetching top bid orders for user ${ownerList[i]["address"]}, moving to next...`
      );
      i++;
      setTimeout(ownerLoop, 1000, resolve, reject);
    }
  };

  return new Promise(ownerLoop);
})();
