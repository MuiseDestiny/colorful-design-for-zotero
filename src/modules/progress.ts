import { config } from "../../package.json";


/**
 * 进度条类，用于渲染各种进度条
 * 构造时需要输入数据，例如[1, 2, 3, 4, 3, 2, 1]
 * 再给一个要显示的box就可以了
 * 
 * 计划实现两种进度条：
 * 1. 阅读高能进度条形式
 * 2. 波浪线形式
 * 3. 标准进度条形式
 */
export default class Progress {
  constructor() {
  }

  /**
   * 用透明度量化各个部分完成情况
   * 适用于 - 阅读高能进度条
   */
  public opacity(values: number[], color: string = "#62b6b7", opacity: string = "1", limit: number = -1): HTMLSpanElement {
    const span = ztoolkit.UI.createElement(
      document,
      "span",
      {
        styles: {
          display: "flex",
          flexDirection: "row",
          height: "100%",
          width: "100%",
          justifyContent: "space-around",
          opacity
        },
        classList: ["opacity-progress"]
      }
    ) as HTMLSpanElement
    let sortedValues = [...values].sort((a, b) => b - a);
    let meanValue = [...values].reduce((a, b) => a + b) / values.length;
    let maxValue = meanValue + (sortedValues[0] - meanValue) * .5
    if (limit > 0) {
      maxValue = maxValue > limit ? maxValue : limit
    }
    let [r, g, b] = Progress.getRGB(color)
    for (let value of values) {
      span.appendChild(
        ztoolkit.UI.createElement(
          document,
          "span",
          {
            styles: {
              height: "100%",
              width: `${100/values.length}%`,
              margin: "0",
              backgroundColor: `rgba(${r}, ${g}, ${b}, ${value / maxValue})`,
            }
          }
        )
      )
    }
    return span
  }

  /**
   * 平滑曲线类型的进度条
   */
  public line(values: number[], color: string = "#FD8A8A", opacity: string = "1"): HTMLDivElement {
    var Raphael = require("./zotero-raphael")
    let container = ztoolkit.UI.createElement(
      document,
      "div",
      {
        classList: ["container-for-raphael"],
        styles: {
          width: "80%",
          height: "20px",
          // opacity
        }
      }
    ) as HTMLDivElement
    document.documentElement.appendChild(container);
    // 绘制部分
    const w = 300, h = w * .08
    let paddingY = 0.2
    let paddingX = 0.05
    let points = []
    const maxValue = [...values].sort((a, b) => b - a)[0]
    const minValue = 0
    for (let i = 0; i < values.length; i++) {
      let x = i * (1 - 2 * paddingX) / (values.length - 1) + paddingX
      let y = 1 - ((values[i] - minValue) / (maxValue - minValue) * (1 - 2 * paddingY) + paddingY)
      points.push({ x: x, y: y })
    }
    // 线绘制
    var polygon = `M ${points[0].x * w} ${h} L ${points[0].x * w}, ${points[0].y * h} R `
      + points.slice(1).map(p => `${p.x * w}, ${p.y * h}`).join(" ")
      + ` V ${h} H ${points[0].x * w}`
    var line = `M ${points[0].x * w}, ${points[0].y * h} R `
      + points.slice(1).map(p => `${p.x * w}, ${p.y * h}`).join(" ")
    
    const paper = Raphael(container, "100%", "100%");
    paper.setViewBox(0, 0, w, h, true)
    const [red, green, blue] = Progress.getRGB(color)
    paper.path(polygon).attr({
      stroke: "transparent",
      fill: `90-rgba(${red}, ${green}, ${blue}, ${opacity})-rgba(${red}, ${green}, ${blue}, 0.8)`,
    })
    paper.path(line).attr({
      stroke: `rgba(${red}, ${green}, ${blue}, 1)`,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })
    // 点绘制
    // 点太多不美观，精简一下
    if (Zotero.Prefs.get(
      `${config.addonRef}.progressColumn.circle`
    ) as boolean) {
      let rx = paddingX
      let ry = paddingY
      let r = rx > ry ? ry : rx
      r = r * .25

      for (let i = 0; i < points.length; i++) {
        let point = points[i]
        if (values.length > 6 && points[i].y == 1 - paddingY) { continue }
        let circle = paper.circle(`${point.x * 100}%`, `${point.y * 100}%`, `${r * 100}%`).attr({
          stroke: `rgba(${red}, ${green}, ${blue}, 1)`,
          strokeWidth: r * .08,
          fill: "white",
          opacity: 0
        })
        circle.animate({
          opacity: 1
        }, 1000, "ease-out")
      }
    }
    // 绘制部分
    return container
  }

  public bar(values: number[], color: string = "#FD8A8A", opacity: string = "1"): HTMLElement {
    let maxValue = [...values].sort((a, b) => b - a)[0]
    let span = ztoolkit.UI.createElement(document, "span", {
      styles: {
        display: "inline-block",
        width: "100%",
        height: "20px",
        opacity
      }
    })
    const [red, green, blue] = Progress.getRGB(color)
    for (let value of values) {
      const styles = {
        position: "absolute",
        display: "inline-block",
        bottom: "0",
        left: "0",
        width: "100%",
      }
      span.appendChild(
        ztoolkit.UI.createElement(document, "span", {
          classList: ["bar-box"],
          styles: {
            display: "inline-block",
            height: "100%",
            width: `${100 / values.length}%`,
            position: "relative"
          },
          children: [
            {
              tag: "span",
              styles: Object.assign({}, styles, {
                height: `${100 * value / maxValue}%`,
                backgroundColor: `rgba(${red}, ${green}, ${blue}, 1)`
              })
            }
          ]
        })
      )
    }
    return span
  }

  /**
   * 线形进度
   * 显示百分比
   */
  public linePercent(value: number, maxValue: number, color: string = "#62B6B7", opacity: string = "1"): HTMLSpanElement {
    const [red, green, blue] = Progress.getRGB(color)
    const percent = value / maxValue * 100
    const heightPct = 0.28
    const span = ztoolkit.UI.createElement(
      document,
      "span",
      {
        styles: {
          position: "relative",
          height: "20px",
          width: "100%",
          margin: "auto 0",
          display: "inline-block",
          opacity
        },
        classList: ["progress"],
        subElementOptions: [
          {
            tag: "span",
            styles: {
              position: "absolute",
              left: "0",
              height: `${heightPct * 100}%`,
              top: `calc(50% - ${heightPct * 100}%/2)`,
              width: "100%",
              display: "inline-block",
              backgroundColor: `rgba(${red}, ${green}, ${blue}, .23)`,
              borderRadius: "1em"
            }
          },
          {
            tag: "span",
            id: "progress",
            styles: {
              position: "absolute",
              left: "0",
              height: `${heightPct * 100}%`,
              top: `calc(50% - ${heightPct * 100}%/2)`,
              width: `${percent > 100 ? 100 : percent}%`,
              transition: "width 1s linear",
              display: "inline-block",
              backgroundColor: `rgba(${red}, ${green}, ${blue}, 1)`,
              borderRadius: "1em"
            }
          }
        ]
      }
    ) as HTMLSpanElement;
    return span
  }

  /**
   * 圆形进度
   * 显示百分比
   */
  public circlePercent(value: number, maxValue: number) {

  }

  public stack(values: number[], record: { page: number; data: { [pageIndex: string]: { value: number; color: string}[] }}, opacity: string) {
    let maxValue = [...values].sort((a, b) => b - a)[0]
    let span = ztoolkit.UI.createElement(document, "span", {
      styles: {
        display: "inline-block",
        width: "100%",
        height: "20px",
        opacity
      }
    })
    for (let pageIndex = 0; pageIndex < record.page;pageIndex++) {
      const styles = {
        position: "absolute",
        display: "inline-block",
        bottom: "0",
        left: "0",
        width: "100%",
      }
      span.appendChild(
        ztoolkit.UI.createElement(document, "span", {
          classList: ["bar-box"],
          styles: {
            display: "inline-block",
            height: "100%",
            width: `${100 / record.page}%`,
            position: "relative"
          },
          children: [
            {
              tag: "span",
              styles: Object.assign({}, styles, {
                height: `${100 * values[pageIndex] / maxValue}%`,
                display: "flex",
                flexDirection: "column"
              }),
              children: (() => {
                if (!record.data[pageIndex]) { return []}
                let arr = []
                for (let data of record.data[pageIndex]) {
                  arr.push({
                    tag: "span",
                    styles: {
                      width: "100%",
                      display: "inline-block",
                      height: `${data.value / values[pageIndex] * 100}%`,
                      backgroundColor: data.color
                    }
                  })
                }
                return arr
              })()
            }
          ]
        })
      )
    }
    return span
  }

  static getRGB(color: string) {
    var sColor = color.toLowerCase();
    //十六进制颜色值的正则表达式
    var reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/;
    // 如果是16进制颜色
    if (sColor && reg.test(sColor)) {
      if (sColor.length === 4) {
        var sColorNew = "#";
        for (var i = 1; i < 4; i += 1) {
          sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1));
        }
        sColor = sColorNew;
      }
      //处理六位的颜色值
      var sColorChange = [];
      for (var i = 1; i < 7; i += 2) {
        sColorChange.push(parseInt("0x" + sColor.slice(i, i + 2)));
      }
      return sColorChange;
    }
    return sColor;
  }

  static shade(col: any, amt: any) {
    var usePound = false;

    if (col[0] == "#") {
      col = col.slice(1);
      usePound = true;
    }

    var num = parseInt(col, 16);

    var r = (num >> 16) + amt;

    if (r > 255) r = 255;
    else if (r < 0) r = 0;

    var b = ((num >> 8) & 0x00FF) + amt;

    if (b > 255) b = 255;
    else if (b < 0) b = 0;

    var g = (num & 0x0000FF) + amt;

    if (g > 255) g = 255;
    else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
  }

}

