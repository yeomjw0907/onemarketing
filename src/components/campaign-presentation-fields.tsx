import { campaignCategories, fulfillmentNames } from "@/lib/campaign-display";
export default function CampaignPresentationFields({
  value = {},
  packageOnly = false,
}: {
  value?: Record<string, any>;
  packageOnly?: boolean;
}) {
  return (
    <>
      <label>
        업종
        <select
          name="category"
          defaultValue={value.category || "other"}
          required
        >
          {Object.entries(campaignCategories)
            .filter(([k]) => k !== "all")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
      </label>
      <label>
        진행 방식
        <select
          name="fulfillment"
          defaultValue={value.fulfillment || "provided"}
          disabled={packageOnly}
        >
          {Object.entries(fulfillmentNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        지역
        <input
          name="region"
          defaultValue={value.region || ""}
          maxLength={100}
          placeholder="방문형 캠페인의 활동 지역"
        />
      </label>
      <label>
        대표 이미지 주소
        <input
          name="imageUrl"
          type="url"
          defaultValue={value.imageUrl || ""}
          maxLength={2000}
          placeholder="https://"
        />
        <small>직접 사용할 권한이 있는 이미지 주소를 입력해주세요.</small>
      </label>
    </>
  );
}
