const puppeteer = require("puppeteer");
const folder = require("fs");
const fs = require("fs/promises");
const { gpulist } = require("./gpulist");
const { cpulist } = require("./cpulist");
const bluebird = require("bluebird");

async function start() {
  const withBrowser = async (fn) => {
    const browser = await puppeteer.launch({
      /* ... */
    });
    try {
      return await fn(browser);
    } finally {
      await browser.close();
    }
  };

  const withPage = (browser) => async (fn) => {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  };

  let urls = [];

  const itemslist = await gpulist;
  const allCPU = await cpulist;
  const allQuality = ["ultra", "hight", "medium", "low"];

  for (let gpu of itemslist) {
    let url = "https://www.gpucheck.com" + gpu;
    if (!folder.existsSync("./gpu/" + gpu.slice(5, -1))) {
      folder.mkdirSync("./gpu/" + gpu.slice(5, -1));
      folder.mkdirSync("./gpu/" + gpu.slice(5, -1) + "/cpu");
    }

    for (let cpu of allCPU) {
      newurl = url + cpu;
      for (let quality of allQuality) {
        urls.push(newurl + "/" + quality);
      }
    }
  }
  var length = urls.length;
  var step = 0;

  await withBrowser(async (browser) => {
    return bluebird.map(
      urls,
      async (url) => {
        return withPage(browser)(async (page) => {
          step++;
          console.log(((step / length) * 100).toFixed(2) + "% - " + url);

          await page.goto(url);

          let quality = url.split("/")[6];
          let cpu = url.split("/")[5];
          let gpu = url.split("/")[4];

          const data = await page.evaluate((quality) => {
            let benchmarkWithCPU = [];
            let overview = document.querySelector(
              "#summary > table > tbody"
            ).children;

            let general = [];
            let specifications = [];
            let imgsrc = "";
            if (quality === "ultra") {
              imgsrc = document.querySelector(
                "body > div.container > div:nth-child(4) > div.col-xl-8 > div.row > div > img"
              );
              if (imgsrc.hasAttribute("src")) {
                imgsrc = imgsrc.src;
              } else {
                imgsrc = "";
              }
              //   Get GPU Information
              for (let i = 0; i < 6; i++) {
                let foundData = overview[i].children;
                if (foundData[0].textContent !== " ") {
                  general.push({
                    name: foundData[0].textContent.trim(),
                    value: foundData[1].textContent.trim(),
                  });
                }
              }

              general.push({
                name: overview[
                  overview.length - 3
                ].children[0].textContent.trim(),
                value:
                  overview[overview.length - 3].children[1].textContent.trim(),
              });

              //   Get GPU Specifications
              let title = "";
              if (
                document.getElementById("specifications").nextElementSibling
                  .nextElementSibling.children.length > 4
              ) {
                Array.from(
                  document.getElementById("specifications").nextElementSibling
                    .nextElementSibling.children
                ).forEach((el) => {
                  let values = [];
                  if (el.tagName === "H4") {
                    title = el.textContent;
                  } else if (el.tagName === "TABLE") {
                    Array.from(el.children[1].children).forEach((value) => {
                      values.push({
                        name: value.children[0].textContent.trim(),
                        value: value.children[1].textContent.trim(),
                      });
                    });
                    specifications.push({
                      title: title,
                      specifications: values,
                    });
                  }
                });
              }
            }

            //   Get Benchmark Information
            for (let i = 6; i < overview.length - 3; i++) {
              let foundData = overview[i].children;
              if (foundData[0].textContent !== " ") {
                benchmarkWithCPU.push({
                  name: foundData[0].textContent.trim(),
                  value: foundData[1].textContent.trim(),
                });
              }
            }

            let gamesfullHd = [];
            Array.from(
              document.getElementById("res1920x1080").children[0].children[1]
                .children
            ).forEach((gameEl) =>
              gamesfullHd.push({
                name: gameEl.children[1].textContent,
                min: gameEl.children[2].children[0].children[0].textContent,
                avg: gameEl.children[2].children[0].children[1].textContent,
              })
            );

            let games2K = [];
            Array.from(
              document.getElementById("res2560x1440").children[0].children[1]
                .children
            ).forEach((gameEl) =>
              games2K.push({
                name: gameEl.children[1].textContent,
                min: gameEl.children[2].children[0].children[0].textContent,
                avg: gameEl.children[2].children[0].children[1].textContent,
              })
            );

            let games4K = [];
            Array.from(
              document.getElementById("res3840x2160").children[0].children[1]
                .children
            ).forEach((gameEl) =>
              games4K.push({
                name: gameEl.children[1].textContent,
                min: gameEl.children[2].children[0].children[0].textContent,
                avg: gameEl.children[2].children[0].children[1].textContent,
              })
            );

            return {
              img: imgsrc,
              info: {
                general: general,
                specifications: specifications,
              },
              cpu: {
                banchmark: benchmarkWithCPU,
                games: {
                  "1920x1080": gamesfullHd,
                  "2560x1440": games2K,
                  "3840x2160": games4K,
                },
              },
            };
          }, quality);

          if (quality === "ultra") {
            if (data.img !== "") {
              const imagepage = await page.goto(data.img);
              await fs.writeFile(
                "gpu/" + gpu + "/" + data.img.split("/").pop(),
                await imagepage.buffer()
              );
            }
            await fs.writeFile(
              "gpu/" + gpu + "/info.json",
              JSON.stringify(data.info)
            );
          }

          await fs.writeFile(
            "gpu/" + gpu + "/cpu/" + quality + "-" + cpu + ".json",
            JSON.stringify(data.cpu)
          );
        });
      },
      { concurrency: 30 }
    );
  });
}

start();
