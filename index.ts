#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import axios from "axios";

const server = new Server(
  {
    name: "ktour-api",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const GetAreaCodeArgsSchema = z.object({
  areaCode: z.string().optional().describe("상위 지역코드 (선택)"),
});

const SearchTourInfoArgsSchema = z.object({
  areaCode: z.string().optional().describe("지역코드"),
  contentTypeId: z
    .string()
    .optional()
    .describe(
      "관광타입(12:관광지, 14:문화시설, 15:축제공연행사, 25:여행코스, 28:레포츠, 32:숙박, 38:쇼핑, 39:음식점)"
    ),
  keyword: z.string().optional().describe("검색 키워드"),
  mapX: z.string().optional().describe("경도 좌표"),
  mapY: z.string().optional().describe("위도 좌표"),
  radius: z.string().optional().describe("거리 반경(미터)"),
});

const GetDetailCommonArgsSchema = z.object({
  contentId: z.string().describe("관광 콘텐츠 ID"),
  defaultYN: z
    .string()
    .optional()
    .default("Y")
    .describe("기본정보 조회여부(Y/N)"),
  firstImageYN: z
    .string()
    .optional()
    .default("Y")
    .describe("대표이미지 조회여부(Y/N)"),
  areacodeYN: z
    .string()
    .optional()
    .default("Y")
    .describe("지역코드 조회여부(Y/N)"),
  addrinfoYN: z
    .string()
    .optional()
    .default("Y")
    .describe("주소정보 조회여부(Y/N)"),
  mapinfoYN: z
    .string()
    .optional()
    .default("Y")
    .describe("좌표정보 조회여부(Y/N)"),
  overviewYN: z
    .string()
    .optional()
    .default("Y")
    .describe("개요정보 조회여부(Y/N)"),
});

async function getAreaCodeByName(areaName) {
  try {
    const result = await callTourAPI("areaCode1", {});
    const items = result.response.body.items.item || [];
    const area = items.find((item) => item.name.includes(areaName));
    return area ? area.code : null;
  } catch (error) {
    throw new Error(`지역코드 조회 오류: ${error.message}`);
  }
}

const contentTypeMapping = {
  관광지: "12",
  문화시설: "14",
  축제: "15",
  행사: "15",
  "축제/행사": "15",
  여행코스: "25",
  레포츠: "28",
  숙박: "32",
  쇼핑: "38",
  음식점: "39",
};

async function callTourAPI(operation, params = {}) {
  const baseUrl = "http://apis.data.go.kr/B551011/KorService1";
  const serviceKey = process.env.TOUR_API_KEY;
  const defaultParams = {
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "ktour-api",
    _type: "json",
    numOfRows: "10",
    pageNo: "1",
  };

  try {
    const response = await axios.get(`${baseUrl}/${operation}`, {
      params: { ...defaultParams, ...params },
    });
    return response.data;
  } catch (error) {
    throw new Error(`TourAPI 호출 오류: ${error.message}`);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_area_code",
        description:
          "한국의 지역코드를 조회합니다. 상위 지역코드를 입력하면 하위 지역 목록을 반환하고, " +
          "입력하지 않으면 광역시/도 목록을 반환합니다.",
        inputSchema: zodToJsonSchema(GetAreaCodeArgsSchema),
      },
      {
        name: "search_tour_info",
        description:
          "지역, 유형, 키워드 등을 기반으로 관광 정보를 검색합니다. " +
          "지역기반, 키워드 기반, 위치기반 검색을 지원합니다.",
        inputSchema: zodToJsonSchema(SearchTourInfoArgsSchema),
      },
      {
        name: "get_detail_common",
        description:
          "특정 관광지, 축제, 숙박 등의 상세 정보를 조회합니다. " +
          "contentId를 기반으로 해당 콘텐츠의 공통 상세정보(제목, 주소, 개요 등)를 제공합니다.",
        inputSchema: zodToJsonSchema(GetDetailCommonArgsSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_area_code": {
        const parsed = GetAreaCodeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            `get_area_code 도구의 인자가 잘못되었습니다: ${parsed.error}`
          );
        }

        const { areaCode } = parsed.data;
        const result = await callTourAPI("areaCode1", { areaCode });

        const items = result.response.body.items.item || [];
        const formattedResult = items
          .map((item) => `[${item.code}] ${item.name}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: formattedResult || "조회된 지역코드가 없습니다.",
            },
          ],
        };
      }

      case "search_tour_info": {
        const parsed = SearchTourInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            `search_tour_info 도구의 인자가 잘못되었습니다: ${parsed.error}`
          );
        }
        let { areaCode, contentTypeId, keyword, mapX, mapY, radius } =
          parsed.data;

        if (keyword && !areaCode) {
          for (const area of [
            "서울",
            "부산",
            "대구",
            "인천",
            "광주",
            "대전",
            "울산",
            "세종",
            "경기",
            "강원",
            "충북",
            "충남",
            "전북",
            "전남",
            "경북",
            "경남",
            "제주",
          ]) {
            if (keyword.includes(area)) {
              const code = await getAreaCodeByName(area);
              if (code) {
                areaCode = code;
                keyword = keyword.replace(area, "").trim();
                break;
              }
            }
          }

          for (const [typeName, typeCode] of Object.entries(
            contentTypeMapping
          )) {
            if (keyword.includes(typeName)) {
              contentTypeId = typeCode;
              keyword = keyword.replace(typeName, "").trim();
              break;
            }
          }
        }

        let operation, params;

        if (mapX && mapY) {
          operation = "locationBasedList1";
          params = { mapX, mapY, radius: radius || "2000", contentTypeId };
        } else if (areaCode && contentTypeId && !keyword) {
          operation = "areaBasedList1";
          params = { areaCode, contentTypeId };
        } else if (keyword) {
          operation = "searchKeyword1";
          params = { keyword, areaCode, contentTypeId };
        } else {
          operation = "areaBasedList1";
          params = { areaCode, contentTypeId };
        }

        const result = await callTourAPI(operation, params);

        const items = result.response.body.items.item || [];
        let formattedResult = "";

        if (items.length === 0) {
          formattedResult = "검색 결과가 없습니다.";
        } else {
          formattedResult = items
            .map((item) => {
              let typeText = "";
              switch (item.contenttypeid) {
                case "12":
                  typeText = "[관광지]";
                  break;
                case "14":
                  typeText = "[문화시설]";
                  break;
                case "15":
                  typeText = "[축제/행사]";
                  break;
                case "25":
                  typeText = "[여행코스]";
                  break;
                case "28":
                  typeText = "[레포츠]";
                  break;
                case "32":
                  typeText = "[숙박]";
                  break;
                case "38":
                  typeText = "[쇼핑]";
                  break;
                case "39":
                  typeText = "[음식점]";
                  break;
                default:
                  typeText = "[기타]";
              }

              return `${typeText} ${item.title}\n주소: ${item.addr1}${
                item.addr2 ? " " + item.addr2 : ""
              }\n콘텐츠ID: ${item.contentid}\n`;
            })
            .join("\n");
        }

        return {
          content: [{ type: "text", text: formattedResult }],
        };
      }

      case "get_detail_common": {
        const parsed = GetDetailCommonArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            `get_detail_common 도구의 인자가 잘못되었습니다: ${parsed.error}`
          );
        }

        const {
          contentId,
          defaultYN,
          firstImageYN,
          areacodeYN,
          addrinfoYN,
          mapinfoYN,
          overviewYN,
        } = parsed.data;

        const result = await callTourAPI("detailCommon1", {
          contentId,
          defaultYN,
          firstImageYN,
          areacodeYN,
          addrinfoYN,
          mapinfoYN,
          overviewYN,
        });

        const item = result.response.body.items.item[0] || {};

        if (!item.title) {
          return {
            content: [
              {
                type: "text",
                text: "해당 콘텐츠 ID에 대한 정보를 찾을 수 없습니다.",
              },
            ],
          };
        }

        let typeText = "";
        switch (item.contenttypeid) {
          case "12":
            typeText = "[관광지]";
            break;
          case "14":
            typeText = "[문화시설]";
            break;
          case "15":
            typeText = "[축제/행사]";
            break;
          case "25":
            typeText = "[여행코스]";
            break;
          case "28":
            typeText = "[레포츠]";
            break;
          case "32":
            typeText = "[숙박]";
            break;
          case "38":
            typeText = "[쇼핑]";
            break;
          case "39":
            typeText = "[음식점]";
            break;
          default:
            typeText = "[기타]";
        }

        let eventPeriod = "";
        if (item.contenttypeid === "15") {
          try {
            const detailIntro = await callTourAPI("detailIntro1", {
              contentId,
              contentTypeId: "15",
            });
            const introItem = detailIntro.response.body.items.item[0] || {};

            if (introItem.eventstartdate && introItem.eventenddate) {
              const startDate = introItem.eventstartdate.replace(
                /(\d{4})(\d{2})(\d{2})/,
                "$1-$2-$3"
              );
              const endDate = introItem.eventenddate.replace(
                /(\d{4})(\d{2})(\d{2})/,
                "$1-$2-$3"
              );
              eventPeriod = `\n축제 기간: ${startDate} ~ ${endDate}`;
            }
          } catch (error) {
            console.error("축제 기간 정보 조회 실패:", error);
          }
        }

        let formattedResult = `${typeText} ${item.title}\n`;

        if (item.addr1) {
          formattedResult += `주소: ${item.addr1}${
            item.addr2 ? " " + item.addr2 : ""
          }\n`;
        }

        if (eventPeriod) {
          formattedResult += eventPeriod + "\n";
        }

        if (item.tel) {
          formattedResult += `전화번호: ${item.tel}\n`;
        }

        if (item.homepage) {
          const homepage = item.homepage.replace(/<[^>]*>/g, "");
          formattedResult += `홈페이지: ${homepage}\n`;
        }

        if (item.overview) {
          const overview = item.overview.replace(/<[^>]*>/g, "");
          formattedResult += `\n개요:\n${overview}\n`;
        }

        if (item.firstimage) {
          formattedResult += `\n이미지 URL: ${item.firstimage}\n`;
        }

        return {
          content: [{ type: "text", text: formattedResult }],
        };
      }

      default:
        throw new Error(`알 수 없는 도구: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `오류: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ktour-api 서버가 실행 중입니다");
}

runServer().catch((error) => {
  console.error("서버 실행 중 오류 발생:", error);
  process.exit(1);
});
