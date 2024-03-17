import { config } from "../../package.json";
import AddonItem from "./item";
import Progress from "./progress";
import { getString, initLocale } from "./locale";

import field2Info from "./easyscholar";
import { updatePublicationTags, getPublicationTitle } from "./utils";
import Bubble from "./bubble";
import { Tags } from "./tags";
import LocalStorage from "./localStorage";
import GraphView from "./graphView";
var ColorRNA = require('color-rna');


export default class Views {
  private progress: Progress;
  private storage: AddonItem | LocalStorage;
  private localStorage = new LocalStorage(config.addonRef)
  private cache: { [key: string]: any } = {};
  private filterFunctions: ((items: Zotero.Item[]) => Zotero.Item[])[] = [];
  public tagsUI?: Tags;
  constructor(storage: AddonItem | LocalStorage) {
    Zotero[config.addonInstance].data.views = this
    this.storage = storage;
    this.progress = new Progress()
    Zotero.ZoteroStyle.data.Tags = Tags;
    this.addStyle()
    try {
      ztoolkit.patch(
        Zotero.CollectionTreeRow.prototype, "getItems", config.addonRef,
        (original) =>
          async function () {
            // @ts-ignore
            let items = await original.call(this);
            const originalLength = items.length
            try {
              if (!Zotero[config.addonInstance]) {return items}
              const filterFunctions = Zotero[config.addonInstance].data.views.filterFunctions
              for (let i = 0; i < filterFunctions.length; i++){
                items = filterFunctions[i](items)
              }
            } catch {

            }
            return items
          }
      )
    } catch {}
  }

  public addStyle() {
    document.querySelector("#odd-even-row-style")?.remove();
    const oddColor = Zotero.Prefs.get(`${config.addonRef}.titleColumn.odd`) as string
    const evenColor = Zotero.Prefs.get(`${config.addonRef}.titleColumn.even`) as string
    const selectedColor = Zotero.Prefs.get(`${config.addonRef}.titleColumn.selected`) as string

    const styles = ztoolkit.UI.createElement(document, "style", {
      id: "odd-even-row-style",
      properties: {
        innerHTML: `
          [id^=item-tree-main-default-row]:nth-child(odd) {
            background-color: ${oddColor} !important;
          }
          [id^=item-tree-main-default-row]:nth-child(even) {
            background-color: ${evenColor} !important;
          }
          #zotero-items-tree .virtualized-table .row.selected, #zotero-items-tree .virtualized-table .row:active {
            ${selectedColor && selectedColor.length ? `background-color: ${selectedColor} !important` : ""}
          }
          #zotero-items-tree .virtualized-table .row:hover {
            ${selectedColor && selectedColor.length ? `background-color: ${selectedColor} !important` : ""}
          }
          .tag-box .tag-swatch {
            position: absolute;
            display: inline-block;
            height: .9em;
            width: .9em;
            border-radius: 100%;
            font-size: 1em;
          }
          .tag-box {
            display: inline-block;
            position: relative;
            height: 1em;
            line-height: 1em;
          }
          @-webkit-keyframes rotate{from{-webkit-transform: rotate(0deg)}
              to{-webkit-transform: rotate(360deg)}
          }
          @-moz-keyframes rotate{from{-moz-transform: rotate(0deg)}
              to{-moz-transform: rotate(359deg)}
          }
          @-o-keyframes rotate{from{-o-transform: rotate(0deg)}
              to{-o-transform: rotate(359deg)}
          }
          @keyframes rotate{from{transform: rotate(0deg)}
              to{transform: rotate(359deg)}
          }
          `
          // 这里添加后会让Mac的图标变形，所以遇Mac不添
          + (Zotero.isMac ? "" : `
          #zotero-style-show-hide-graph-view .toolbarbutton-icon {
            width: 16px;
            height: 16px;
          }
          `)
      },
    });
    document.documentElement.appendChild(styles);
  }

  /**
   * 渲染标题进度条，调整标签
   * 标题是必定显示的所以奇数偶数显示逻辑写在这里
   */
  public async renderTitleColumn() {
    // 防止与其他插件冲突
    await Zotero.Promise.delay(1000)
    ztoolkit.log("renderTitleColumn")
    if (!Zotero.Prefs.get(`${config.addonRef}.function.titleColumn.enable`) as boolean) { return }
    const key = "title"
    await ztoolkit.ItemTree.addRenderCellHook(
      key,
      (index: number, data: string, column: any, original: Function) => {
        if (ZoteroPane.getSelectedItems().length == 0) {
          try {
            if (index > 0) {
              const rowNode = document.querySelector(`#item-tree-main-default-row-${index}`) as HTMLDivElement
              const previousRow = document.querySelector(`#item-tree-main-default-row-${index - 1}`) as HTMLDivElement
              if (rowNode && previousRow) {
                previousRow.after(rowNode)
              }
            }
          } catch { }
        }
        const cellSpan = original(index, data, column) as HTMLSpanElement;
        // 图标替换
        try {
          this.replaceCellIcon(ZoteroPane.getSortedItems()[index], cellSpan)
        } catch { }
        let titleSpan = cellSpan.querySelector(".cell-text") as HTMLSpanElement;
        const titleHTML = titleSpan.innerHTML
        titleSpan.innerHTML = ""
        const span = ztoolkit.UI.createElement(
          document,
          "span",
          {
            id: "title",
            properties: {
              innerHTML: titleHTML
            }
          }
        )
        titleSpan.appendChild(span)
        if (!Zotero.Prefs.get(
          `${config.addonRef}.titleColumn.tags`
        )) {
          // 移除标签
          cellSpan.querySelectorAll(".tag-swatch").forEach(e => {
            e.remove()
          })
        } else {
          cellSpan.querySelectorAll(".tag-swatch").forEach(e => {
            titleSpan.insertBefore(e, span)
            span.style.marginLeft = "0.3em"
          });
        }
        // @ts-ignore
        titleSpan.firstChild.style.marginLeft = ".3em"
        const color = Zotero.Prefs.get(
          `${config.addonRef}.titleColumn.color`
        ) as string;
        const opacity = Zotero.Prefs.get(
            `${config.addonRef}.titleColumn.opacity`
          ) as string
        if (Number(opacity) == 0) { return cellSpan }
        const item = ZoteroPane.itemsView.getRow(index).ref
        let record: Record = this.storage.get(item, "readingTime") as Record
        if(!record) { return cellSpan }
        let values = []
        for (let i = 0; i < record.page; i++) {
          values.push(parseFloat(record.data[i] as string) || 0)
        }
        if (values.length == 0) { return cellSpan }
        titleSpan.style.position = "relative";
        titleSpan.style.width = "100%";
        titleSpan.style.zIndex = "1"
        let progressNode = this.progress.opacity(
          values,
          color,
          opacity,
          60
        )
        progressNode.style.top = "0"
        progressNode.style.zIndex = "-1"

        progressNode.style.position = "absolute"

        titleSpan.appendChild(progressNode)
        return cellSpan;
      }
    );
    this.patchSetting(
      key,
      [
        {
          prefKey: "titleColumn.tags",
          name: "Tags",
          type: "boolean"
        },
        {
          prefKey: "titleColumn.color",
          name: "Color",
          type: "input",
        },
        {
          prefKey: "titleColumn.opacity",
          name: "Opacity",
          type: "range",
          range: [0, 1, 0.01],
        },
      ]
    )
  }

  public async renderCreatorColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.creatorColumn.enable`) as boolean) { return }
    const key = "firstCreator"
    await ztoolkit.ItemTree.addRenderCellHook(
      key,
      (index: number, data: string, column: any, original: Function) => {
        const cellSpan = original(index, data, column) as HTMLSpanElement;
        const item = ZoteroPane.getSortedItems()[index]
        const creators = item.getCreators() as any
        const firstCreator = item.firstCreator as string;
        const format = Zotero.Prefs.get(`${config.addonRef}.creatorColumn.format`) as string
        const join = Zotero.Prefs.get(`${config.addonRef}.creatorColumn.join`) as string
        let slices = Zotero.Prefs.get(`${config.addonRef}.creatorColumn.slices`) as string
        let newCreators: any = []
        try {
          slices.split(/,\s*/).forEach((slice: string) => {            
            newCreators = newCreators.concat(
              creators.slice(...slice.split(":").filter(i => i.trim().length).map(i => Number(i)))
            )
          })
        } catch { return cellSpan}
        let textArray = []
        for (let i = 0; i < newCreators.length; i++) {
          textArray.push(
            format
              .replace(/\$\{firstName\}/g, newCreators[i].firstName)
              .replace(/\$\{lastName\}/g, newCreators[i].lastName)
              .replace(/\$\{firstCreator\}/g, firstCreator)
          )
        }
        cellSpan.innerText = textArray.join(join)
        return cellSpan
      }
    )

    this.patchSetting(
      key,
      [
        {
          prefKey: "creatorColumn.format",
          name: "Format",
          type: "input"
        },
        {
          prefKey: "creatorColumn.slices",
          name: "Slices",
          type: "input",
        },
        {
          prefKey: "creatorColumn.join",
          name: "Join",
          type: "input",
        },
      ]
    )
  }

  public async renderPublicationColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.publicationColumn.enable`) as boolean) { return }
    const key = "publicationTitle"
    await ztoolkit.ItemTree.addRenderCellHook(
      key,
      (index: number, data: string, column: any, original: Function) => {
        const cellSpan = original(index, data, column) as HTMLSpanElement;
        try {
          const fields = Zotero.Prefs.get(`${config.addonRef}.publicationColumn.fields`) as string
          const item = ZoteroPane.getSortedItems()[index]
          cellSpan.innerText = data || fields.split(/,\x20*/).map((field:string) => {
            return item.getField(field)
          }).find((i:string)=>i.length>0) || ""
        } catch {}
        return cellSpan
      }
    )
    this.patchSetting(
      key,
      [
        {
          prefKey: "publicationColumn.fields",
          name: "Fields",
          type: "input"
        },
      ]
    )
  }

  private replaceCellIcon(item: Zotero.Item, cellSpan: HTMLSpanElement) {
    const iconSpan = cellSpan.querySelector(".cell-icon") as HTMLSpanElement
    let res = item.attachmentPath?.match(/\.(\w+)$/)
    if (!res || res.length != 2) { return }
    switch (res[1]) {
      case "jpeg":
      case "png":
      case "jpg":
      case "gif":
        iconSpan.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/picture.png)`
        break
      case "zip":
      case "gz":
      case "tar":
        iconSpan.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/zip.png)`
        break
      case "doc":
      case "docx":
      case "docm":
        iconSpan.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/word.png)`
        break
      case "pptx":
      case "ppt":
      case "pptm":
        iconSpan.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/ppt.png)`
        break
      case "xls":
      case "xlsx":
      case "xltx":
        iconSpan.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/excel.png)`
        break
      default:
        break
    }
  }

  /**
   * 把标签从标题分离为单独的列
   */
  public async createTagsColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.tagsColumn.enable`) as boolean) { return } 
    // 用于分离多emoj，很魔鬼的bug
    const runes = require("runes")
    try {
      // 新增加的标签列，在调用Zotero.Tags，setColor时不会刷新
      ztoolkit.patch(Zotero.Tags, "setColor", config.addonRef + "setColor", (original) => {
        return async (id: number, name: string, color: string, pos: number) => {
          await original.call(Zotero.Tags, id, name, color, pos)
          window.setTimeout(async () => {
            // @ts-ignore
            await ztoolkit.ItemTree.refresh();
          })
        }
      })
      ztoolkit.patch(Zotero.Tags, "removeFromLibrary", config.addonRef + "removeFromLibrary", (original) => {
        return async (libraryID: number, tagIDs: number[]) => {
          await original.call(Zotero.Tags, libraryID, tagIDs)
          window.setTimeout(async () => {
            // @ts-ignore
            await ztoolkit.ItemTree.refresh();
          })
        }
      })
    } catch {}

    const key = "Tags"
    await ztoolkit.ItemTree.register(
      key,
      getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        let coloredTags = item.getColoredTags()
        return coloredTags.length > 0 ? JSON.stringify(coloredTags) : "";
      },
      {
        renderCellHook(index, data, column) {
          let getTagSpan = (tag: string, color: string) => {
            let tagSpan = ztoolkit.UI.createElement(document, "span") as HTMLSpanElement
            tagSpan.className = "tag-swatch"
            if (Zotero.Utilities.Internal.isOnlyEmoji(tag)) {
              tagSpan.textContent = tag;
            } else {
              tagSpan.style.backgroundColor = color;
            }
            return tagSpan
          }
          const tagSpans = ztoolkit.UI.createElement(document, "span") as HTMLSpanElement
          tagSpans.style.width = "100%"
          tagSpans.className = "tag-box"
          if (!data) { return tagSpans }
          let tags: { tag: string, color: string }[]
          try {
            tags = JSON.parse(data)
          } catch {
            ztoolkit.log(data)
            return tagSpans
          }
          const align = Zotero.Prefs.get(
            `${config.addonRef}.tagsColumn.align`
          ) as any || "left"
          let offset = 0
          const margin = parseFloat(
            Zotero.Prefs.get(
              `${config.addonRef}.tagsColumn.margin`
            ) as string
          )
          tags.forEach(tagObj => {
            let tag = tagObj.tag, color = tagObj.color
            if (tag.startsWith("#")) { return }
            if (Zotero.Utilities.Internal.isOnlyEmoji(tag)) {
              runes(tag).forEach((tag: string) => {
                let tagSpan = getTagSpan(tag, color)
                tagSpan.style[align] = `${offset}em`
                tagSpans.appendChild(tagSpan)
                offset += margin + 1
              })
            } else {
              let tagSpan = getTagSpan(tag, color)
              tagSpan.style.top = ".1em"
              tagSpan.style[align] = `${offset + 0.25 * Number(align == "left" ? 1 : -1)}em`
              tagSpans.appendChild(tagSpan)
              offset += margin + 1
            }
          })
          return tagSpans;
        },
      }
    );

    this.patchSetting(
      key,
      [
        {
          prefKey: "tagsColumn.align",
          name: "Align",
          type: "select",
          values: ["left", "right"],
        },
        {
          prefKey: "tagsColumn.margin",
          name: "Margin",
          type: "range",
          range: [0, 1, 0.01],
        }
      ]
    )
  }

  /**
   * #标签，只显#标注的示文字标签
   */
  public async createTextTagsColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.textTagsColumn.enable`) as boolean) { return }
    const key = "Tags"
    await ztoolkit.ItemTree.register(
      "Text" + key,
      "#" + getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        let coloredTags = item.getColoredTags()
        let tags = item.getTags().filter(tag => coloredTags.map((tag: any) => tag.tag).indexOf(tag.tag) == -1)
        tags = [...coloredTags, ...tags.sort((a, b) => a.tag > b.tag ? 1 : -1)]
        return tags.length > 0 ? JSON.stringify(tags) : "";
      },
      {
        renderCellHook(index, data, column) {
          const margin = Zotero.Prefs.get(`${config.addonRef}.text${key}Column.margin`) as string
          const padding = Zotero.Prefs.get(`${config.addonRef}.text${key}Column.padding`) as string
          let getTagSpan = (tag: string, backgroundColor?: string) => {
            const _backgroundColor = Zotero.Prefs.get(
              `${config.addonRef}.text${key}Column.backgroundColor`
            ) as string
            const textColor = Zotero.Prefs.get(
              `${config.addonRef}.text${key}Column.textColor`
            ) as string
            backgroundColor = backgroundColor || _backgroundColor || "#fadec9"
            const c = new ColorRNA(backgroundColor)
            let [red, green, blue] = c.rgb()
            const hsl = c.HSL()
            hsl[2] = 40
            let opacity = parseFloat(
              Zotero.Prefs.get(
                `${config.addonRef}.text${key}Column.opacity`
              ) as string
            )
            let tagSpan = ztoolkit.UI.createElement(document, "span", {
              namespace: "html",
              styles: {
                backgroundColor: `rgba(${red}, ${green}, ${blue}, ${opacity})`,
                padding: `0.05em ${padding}em`,
                // color: textColor == "auto" ? `rgba(${red}, ${green}, ${blue}, 1)` : textColor,
                color: textColor == "auto" ? c.HSL(hsl).getHex() : textColor,
                borderRadius: "3px",
                margin: `${margin}em`
              },
              properties: {
                innerText: tag
              }
            }) as HTMLSpanElement
            return tagSpan
          }
          const tagSpans = ztoolkit.UI.createElement(document, "span", {
            namespace: "html",
            styles: {
              display: "block"
            }
          }) as HTMLSpanElement
          if (!data) { return tagSpans }
          let tags: { tag: string, color: string }[]
          try {
            tags = JSON.parse(data)
          } catch {
            return tagSpans
          }
          tags.forEach(tagObj => {
            let tag = tagObj.tag, color = tagObj.color
            tag = Tags.getTagMatch(tag)
            if (tag) {
              let tagSpan = getTagSpan(tag, color)
              tagSpans.appendChild(tagSpan)
            }
          })
          return tagSpans;
        },
      }
    );
    this.patchSetting(
      "Text" + key,
      [
        {
          prefKey: `textTagsColumn.match`,
          name: "Match",
          type: "input"
        },
        {
          prefKey: "textTagsColumn.textColor",
          name: "Text",
          type: "input"
        },
        {
          prefKey: "textTagsColumn.backgroundColor",
          name: "Background",
          type: "input"
        },
        {
          prefKey: "textTagsColumn.opacity",
          name: "Opacity",
          type: "range",
          range: [0, 1, 0.01]
        },
        {
          prefKey: "textTagsColumn.margin",
          name: "Margin",
          type: "range",
          range: [0, 0.5, 0.001]
        },
        {
          prefKey: "textTagsColumn.padding",
          name: "Padding",
          type: "range",
          range: [0, 1, 0.001]
        },
        
      ]
    )
  }

  /**
   * 创建分区影响因子列
   * 不同分区用不同颜色表示，不同影响因子用长度表示，默认是当前collection最大影响因子
   */
  public async createPublicationTagsColumn() {
    await this.localStorage.lock.promise;
    if (!Zotero.Prefs.get(`${config.addonRef}.function.PublicationTagsColumn.enable`) as boolean) { return }
    const key = "PublicationTags"
    await ztoolkit.ItemTree.register(
      key,
      getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        if (!item.isRegularItem()) { return ""}
        try {
          const data = this.localStorage.get(item, "publication")
          if (data == undefined) {
            // 自动更新
            window.setTimeout(async () => {
              await updatePublicationTags(this.localStorage, item)
            })
            return ""
          }
          if (data == "") { return data }
          // 排序
          let sortBy: any = Zotero.Prefs.get(`${config.addonRef}.${key}Column.sortBy`) as string
          sortBy = sortBy.split(/,\s*/g)
          let s = sortBy.map((k: string) => {
            let value
            if (k.startsWith("-")) {
              k = k.slice(1)
              if (!data[k]) {
                value = 1e5
              } else {
                value = (1e5 - parseInt(String(Number(data[k].replace(/[^0-9\.]/g, "")) * 1e3)))
              }
            } else {
              if (!data[k]) {
                value = 1e5
              } else {
                value = parseInt(String(Number(data[k].replace(/[^0-9\.]/g, "")) * 1e3))
              }
            }
            value = String(value)
            value = value.slice(0, 6)
            while (value.length < 6) {
              value = "0" + value
            }
            return value
          }).join(".")
          return s + " \n" + JSON.stringify(data)
        } catch (e) {
          console.log(e)
          return ""
        }
      },
      {
        renderCellHook: (index: any, data: any, column: any) => {
          const span = ztoolkit.UI.createElement(document, "span", {
            styles: {
              display: "block",
              width: "100%",
            }
          }) as HTMLSpanElement
          if (data == "") {
            span.style.height = "20px"
            return span
          }
          try {
            try {
              data = JSON.parse(data.split("\n")[1])
            } catch {
              return span
            }
            if (Object.keys(data).length == 0) { return span }
            // 渲染逻辑
            let rankColors = (Zotero.Prefs.get(`${config.addonRef}.${key}Column.rankColors`) as string).split(/,\s*/g)
            const defaultColor = Zotero.Prefs.get(`${config.addonRef}.${key}Column.defaultColor`) as string
            const textColor = Zotero.Prefs.get(`${config.addonRef}.${key}Column.textColor`) as string
            const opacity = Zotero.Prefs.get(`${config.addonRef}.${key}Column.opacity`) as string
            const margin = Zotero.Prefs.get(`${config.addonRef}.${key}Column.margin`) as string
            const padding = Zotero.Prefs.get(`${config.addonRef}.${key}Column.padding`) as string
            let fields: any = Zotero.Prefs.get(`${config.addonRef}.${key}Column.fields`) as string
            fields = fields.split(/,\s*/g).filter((i: string) => data[i])
            let mapString: any = Zotero.Prefs.get(`${config.addonRef}.${key}Column.map`) as string
            let mapArr: [RegExp | string, string][] = mapString.split(/[,;]\s*/g).filter((s: string)=>s.trim().length).map((ss: string) => {
              let [s1, s2] = ss.split("=")
              // 如果s1是正则转化为正则
              const res = s1.match(/\/(.+)\/(\w*)/)
              if (res) {
                return [
                  new RegExp(res[1], res[2]),
                  s2
                ]
              } else {
                return [
                  s1,
                  s2
                ]
              }
            })
            let getMapString = (s: string) => {
              try {
                for (let i = 0; i < mapArr.length; i++){
                  if (typeof mapArr[i][0] == "string") {
                    if (mapArr[i][0] == s) {
                      s = mapArr[i][1]
                    }
                  } else if ((mapArr[i][0] as RegExp).test(s)) {
                    s = s.replace(mapArr[i][0], mapArr[i][1])
                    break
                  }
                }
                return s
              } catch (e) {
                ztoolkit.log(e)
                return s
              }
            }
            for (let i = 0; i < fields.length; i++) {
              let field = fields[i]
              let fieldValue = data[field]
              let text, color
              if (field in field2Info) {
                let info = field2Info[field](fieldValue)
                let rankIndex = info.rank - 1
                color = rankIndex >= rankColors.length ? rankColors.slice(-1)[0] : rankColors[rankIndex]
                text = [getMapString(info.key), getMapString(info.value)].filter(i => i.length > 0).join(" ")
              } else {
                if (field.toUpperCase() == fieldValue.toUpperCase()) {
                  text = getMapString(fieldValue.toUpperCase())
                } else {
                  text = `${getMapString(field.toUpperCase())} ${getMapString(fieldValue)}`
                }
                // let color: string
                if (["A", "B", "C", "D"].indexOf(fieldValue)) {
                  switch (fieldValue) {
                    case "A":
                      color = rankColors[0]
                      break;
                    case "B":
                      color = rankColors[1]
                      break;
                    case "C":
                      color = rankColors[2]
                      break;
                    case "D":
                      color = rankColors[3]
                      break;
                    case "E":
                      color = rankColors[4]
                      break
                    default:
                      color = defaultColor
                      break;
                  }
                } else {
                  color = defaultColor
                }
              }
              const c = new ColorRNA(color)
              let [red, green, blue] = c.rgb()
              const hsl = c.HSL()
              hsl[2] = 40
              // 如果文本颜色是auto，则进行处理
              span.appendChild(ztoolkit.UI.createElement(document, "span", {
                styles: {
                  backgroundColor: `rgba(${red}, ${green}, ${blue}, ${opacity})`,
                  // color: textColor == "auto" ? `rgba(${red}, ${green}, ${blue}, 1)` : textColor,
                  color: textColor == "auto" ? c.HSL(hsl).getHex() as string : textColor,
                  padding: `0.05em ${padding}em`,
                  borderRadius: "3px",
                  margin: `${margin}em`
                },
                properties: {
                  innerText: text
                }
              }))
            }
            if (!span.querySelector("span")) {
              span.style.height = "20px"
            }
            return span;
          } catch (e) {
            ztoolkit.log(e)
            return span
          }
        },
      }
    );

    this.patchSetting(
      key,
      [
        {
          prefKey: `${key}Column.fields`,
          name: "Fields",
          type: "input",
        },
        {
          prefKey: `${key}Column.map`,
          name: "Map",
          type: "input",
        },
        {
          prefKey: `${key}Column.rankColors`,
          name: "Rank Colors",
          type: "input"
        },
        {
          prefKey: `${key}Column.defaultColor`,
          name: "Default Color",
          type: "input"
        },
        {
          prefKey: `${key}Column.textColor`,
          name: "Text Color",
          type: "input"
        },
        {
          prefKey: `${key}Column.sortBy`,
          name: "Sort By",
          type: "input"
        },
        {
          prefKey: `${key}Column.opacity`,
          name: "Opacity",
          type: "range",
          range: [0, 1, 0.01],
        },
        {
          prefKey: `${key}Column.margin`,
          name: "Margin",
          type: "range",
          range: [0, 0.5, 0.001]
        },
        {
          prefKey: `${key}Column.padding`,
          name: "Padding",
          type: "range",
          range: [0, 1, 0.001]
        },
      ],
      500
    )
  }

  /**
   * 附件标签
   * `PDF 2.3M` `HTML `
   * 点击可以打开PDF或网页或其它
   */
  public async createAttachmentTagsColumn() {
  }

  /**
   * 创建分区影响因子列
   * 不同分区用不同颜色表示，不同影响因子用长度表示，默认是当前collection最大影响因子
   */
  public async createIFColumn() {
    await this.localStorage.lock.promise
    if (!Zotero.Prefs.get(`${config.addonRef}.function.IFColumn.enable`) as boolean) { return }
    const key = "IF"
    await ztoolkit.ItemTree.register(
      key,
      getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        const data = this.localStorage.get(item, "publication")
        if (!data) { return "-1" }
        let value = data[Zotero.Prefs.get(`${config.addonRef}.${key}Column.field`) as string] || data.sciif || data.sciif5
        if (value) {
          return value
        }
      },
      {
        renderCellHook: (index: any, data: any, column: any) => {
          const span = ztoolkit.UI.createElement(document, "span", {
            styles: {
              display: "flex",
              flexDirection: "row"
            }
          }) as HTMLSpanElement
          let value = Number(data)
          if (value == -1) { return span }
          const isProgress = Zotero.Prefs.get(
            `${config.addonRef}.IFColumn.progress`
          ) as boolean
          const isInfo = Zotero.Prefs.get(
            `${config.addonRef}.IFColumn.info`
          ) as boolean
          if (isProgress) {
            let progressNode = (new Progress()).linePercent(
              value,
              parseFloat(Zotero.Prefs.get(
                `${config.addonRef}.IFColumn.max`
              ) as string),
              Zotero.Prefs.get(
                `${config.addonRef}.IFColumn.color`
              ) as string,
              Zotero.Prefs.get(
                `${config.addonRef}.IFColumn.opacity`
              ) as string
            )
            isInfo && (progressNode.style.marginRight = "0.5em")
            span.appendChild(progressNode)
          }
          if (isInfo) {
            span.appendChild(ztoolkit.UI.createElement(document, "span", {
              styles: {
                display: "inline-block",
                width: "4em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"

              },
              properties: {
                innerText: value
              }
            }))
          }
          return span;
        },
      }
    );

    this.patchSetting(
      key,
      [
        {
          prefKey: "IFColumn.field",
          name: "Field",
          type: "input"
        },
        {
          prefKey: "IFColumn.color",
          name: "Color",
          type: "input",
        },
        {
          prefKey: "IFColumn.opacity",
          name: "Opacity",
          type: "range",
          range: [0, 1, 0.01],
        },
        {
          prefKey: "IFColumn.max",
          name: "Max",
          type: "input"
        },
        {
          prefKey: "IFColumn.progress",
          name: "Progress",
          type: "boolean"
        },
        {
          prefKey: "IFColumn.info",
          name: "Info",
          type: "boolean"
        }
      ]
    )
  }

  /**
   * 创建进度列，用于展示标注分布
   */
  public async createProgressColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.progressColumn.enable`) as boolean) { return }
    let update = async (item: Zotero.Item) => {
      const cacheKey = `${item.key}-annoRecord`
      if (item.isRegularItem()) {
        let pdfItem: Zotero.Item
        try {
          pdfItem = await item.getBestAttachment()
        } catch {
          return
        }
        if (!pdfItem) {
          return
        }
        let page: number = 0;
        try {
          const key = `${pdfItem.id} total-pages`
          // this.cache[key] ??= (await Zotero.Fulltext.getPages(pdfItem.id)).total
          // if (!this.cache[key]) {
          //   window.setTimeout(async () => {
          //     await Zotero.FullText.indexItems([pdfItem.id], { complete: true });
          //   })
          // }
          page = Number(this.storage.get(item, "readingTime").page) ||
            (this.cache[key] ??= (await Zotero.Fulltext.getPages(pdfItem.id)).total) ||
            page
        } catch (e) {  }
        let annoRecord: any = { page, data: {} }
        const annoArray = pdfItem.getAnnotations()
        annoArray.forEach((anno: any) => {
          const charNum = (anno.annotationText || anno.annotationComment || "").length
          try {
            let pageIndex = Number(JSON.parse(anno.annotationPosition).pageIndex)
            const _page = pageIndex + 1
            page = _page > page ? _page : page
            annoRecord.data[pageIndex] ??= []
            annoRecord.data[pageIndex].push({ value: charNum, color: anno.annotationColor })
          } catch { }
        })
        annoRecord.page = page
        this.cache[cacheKey] = annoRecord
        return annoRecord
      }
    }
    const key = "Progress"
    await ztoolkit.ItemTree.register(
      key,
      getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        window.setTimeout(async () => {
          await update(item)
        })
        return ""
      },
      {
        renderCellHook: (index: any, data: any, column: any) => {
          const span = ztoolkit.UI.createElement(document, "span", {
            styles: {
              display: "inline-block",
              width: "100%",
              height: "20px"
            }
          }) as HTMLSpanElement
          let selectedItems = ZoteroPane.getSelectedItems()
          let item = ZoteroPane.getSortedItems()[index]
          const cacheKey = `${item.key}-annoRecord`
          let annoRecord = this.cache[cacheKey]
          if (!annoRecord) { return span}
          if (selectedItems.length) {
            if (selectedItems[0].key == item.key) {
              window.setTimeout(async () => {
                await update(item)
              })  
            }
          }
          const style = Zotero.Prefs.get(
            `${config.addonRef}.progressColumn.style`
          ) as string || "bar"
          const color = Zotero.Prefs.get(
            `${config.addonRef}.progressColumn.color`
          ) as string;
          const opacity = Zotero.Prefs.get(
            `${config.addonRef}.progressColumn.opacity`
          ) as string;
          let progressNode
          const UI = new Progress()
          let values = []
          for (let i = 0; i < annoRecord.page; i++) {
            values.push(annoRecord.data[i] ? annoRecord.data[i].map((i: any)=>i.value).reduce((a: any, b: any) => a + b) : 0)
          }
          if (!values.length) { return span}
          if (style != "stack") {
            // 不是stack，需要精简数据
            if ([...values].sort((a, b) => b -a )[0] == 0) { return span}
            // @ts-ignore
            progressNode = UI[style](
              values,
              color,
              opacity
            )
          } else {
            progressNode = UI.stack(values, annoRecord, opacity);
          }
          span.appendChild(progressNode)
          return span;
        },
      }
    );
    this.patchSetting(
      key,
      [
        {
          prefKey: "progressColumn.style",
          name: "Style",
          type: "select",
          values: ["bar", "line", "opacity", "stack"]
        },
        {
          prefKey: "progressColumn.color",
          name: "Color",
          type: "input",
        },
        {
          prefKey: "progressColumn.opacity",
          name: "Opacity",
          type: "range",
          range: [0, 1, 0.01],
        },
        {
          prefKey: "progressColumn.circle",
          name: "Circle",
          type: "boolean"
        }
      ]
    )
  }

  /**
   * 模仿Endnote评级
   */
  public async createRatingColumn() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.ratingColumn.enable`) as boolean) { return }
    const key = "Rating"
    await ztoolkit.ItemTree.register(
      key,
      getString(`column.${key}`),
      (
        field: string,
        unformatted: boolean,
        includeBaseMapped: boolean,
        item: Zotero.Item
      ) => {
        const rating = ztoolkit.ExtraField.getExtraField(item, "rate")
        return rating ? rating : "0"
      },
      {
        renderCellHook: (index: any, data: any, column: any) => {
          let keys = ZoteroPane.getSelectedItems().map(i=>i.key)
          const isSelected = keys.indexOf(ZoteroPane.getSortedItems()[index].key) != -1
          const maxNum = 5
          const rate = Number(data)
          const span = ztoolkit.UI.createElement(document, "span", {
            namespace: "html",
            styles: {
              display: "block"
            }
          }) as HTMLSpanElement
          const mark = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.mark`) as string
          const option = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.option`) as string
          const size = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.size`) as string
          const padding = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.padding`) as string
          const color = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.color`) as string

          for (let i = 0; i < maxNum; i++){
            let text: string
            if (i < rate) {
              text = mark
            } else {
              text = isSelected ? option : ""
            }
            span.appendChild(
              ztoolkit.UI.createElement(document, "span", {
                classList: ["option"],
                styles: {
                  display: "inline-block",
                  height: "1em",
                  width: "1em",
                  color: color,
                  padding: `0 ${padding}em`,
                  fontSize: `${size}em`,
                  textAlign: "center",
                },
                properties: {
                  innerText: text
                }
              })
            )
          }
          return span
        },
      }
    );

    this.patchSetting(
      key,
      [
        {
          prefKey: "ratingColumn.mark",
          name: "Mark",
          type: "input",
        },
        {
          prefKey: "ratingColumn.option",
          name: "Option",
          type: "input",
        },
        {
          prefKey: "ratingColumn.color",
          name: "Color",
          type: "input",
        },
        {
          prefKey: "ratingColumn.size",
          name: "Size",
          type: "range",
          range: [1, 2, 0.01]
        },
        {
          prefKey: "ratingColumn.padding",
          name: "Padding",
          type: "range",
          range: [0, 1, 0.01]
        }
      ]
    )
  }

  /**
   * 顶栏显示视图切换圆点按钮
   */
  public registerSwitchColumnsViewUI() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.columnsViews.enable`) as boolean) { return }
    type ColumnsView = {
      name: string;
      position: string;
      content: string;
      dataKeys: string[];
      prefs?: any;
    }
    const prefKey = `${config.addonRef}.columnsViews`

    // functions
    let switchColumnsView = (columnView: ColumnsView) => {
      ztoolkit.log("columnView", columnView)
      const allColumns = ZoteroPane.itemsView.tree._columns._columns
      let prefs = ZoteroPane.itemsView.tree._columns._getPrefs();
      allColumns.forEach((column: any) => {
        let _column = (columnView.prefs ??= {})[column.dataKey] ||
        {
          hidden: columnView.dataKeys.indexOf(column.dataKey) == -1,
          width: column.width,
          ordinal: column.ordinal
        }
        if (!column.fixedWidth) {
          prefs[column.dataKey].width = column.width = _column.width;
        }
        prefs[column.dataKey].ordinal = column.ordinal = _column.ordinal;
        prefs[column.dataKey].hidden = column.hidden = _column.hidden;
      })
      ZoteroPane.itemsView.tree._columns._storePrefs(prefs);
      ztoolkit.ItemTree.refresh()
    }
    let getCurrentDataKeys = () => {
      const dataKeys = (
        (ZoteroPane.itemsView.tree._columns._columns as { hidden: boolean, dataKey: string }[])
          .filter(i => !i.hidden)
        .map(i => i.dataKey)
      )
      return dataKeys
    }
    let isCurrent = (columnView: ColumnsView) => {
      return isSame(getCurrentDataKeys(), columnView.dataKeys)
    }
    let isSame = (a: string[], b: string[]) => {
      return JSON.stringify(a.sort()) == JSON.stringify(b.sort())
    }
    let optionTimer: number | undefined = undefined
    let updateOptionNode = (timeout: number, currentIndex: number = -1) => {
      window.clearTimeout(optionTimer)
      const columnsViews = JSON.parse(Zotero.Prefs.get(prefKey) as string) as ColumnsView[]
      if (currentIndex != -1 && switchContainer.querySelector("span")) {
        switchContainer.querySelectorAll("span")[currentIndex].click()
      } else {
        switchContainer.querySelectorAll("span").forEach(e => e.remove())
        for (let i = 0; i < columnsViews.length; i++) {
          let columnsView = columnsViews[i]
          const r: number = .7
          const color = {
            active: "#FF597B",
            default: "#F9B5D0"
          }
          let b1: Bubble, b2: Bubble, c1: number, c2: number
          const optionNode = ztoolkit.UI.createElement(
            document,
            "span",
            {
              styles: {
                display: "inline-block",
                borderRadius: "1em",
                width: `${r}em`,
                height: `${r}em`,
                backgroundColor: ((currentIndex == i) || (currentIndex == -1 && isCurrent(columnsView))) ? color.active : color.default,
                transition: "background-color .23s linear",
                opacity: "0.7",
                cursor: "pointer",
                margin: " 0 .3em"
              },
              listeners: [
                {
                  type: "mouseenter",
                  listener: () => {
                    b1 = new Bubble(optionNode, "bubble-option-name", columnsView.name, "top")
                    if (columnsView.content == columnsView.name) {
                      document.querySelector(".bubble-option-content")?.remove()
                    } else {
                      b2 = new Bubble(optionNode, "bubble-option-content", columnsView.content, "bottom")
                    }
                  }
                },
                {
                  type: "mouseleave",
                  listener: () => {
                    const t = 230
                    c1 = window.setTimeout(() => {
                      b1.ele.style.opacity = "0"
                      window.setTimeout(() => {
                        b1.ele.remove()
                      }, t)
                    }, t)
                    b1.ele.setAttribute("closeTimer", String(c1))
                    if (b2) {
                      c2 = window.setTimeout(() => {
                        b2.ele.style.opacity = "0"
                        window.setTimeout(() => {
                          b2.ele.remove()
                        }, t)
                      }, t)
                      b2.ele.setAttribute("closeTimer", String(c2)) 
                    }
                  }
                },
                {
                  type: "click",
                  listener: () => {
                    switchColumnsView(columnsView)
                    optionNode.parentNode?.childNodes.forEach((e: any) => e.style.backgroundColor = color.default)
                    optionNode.style.backgroundColor = color.active
                  }
                }
              ]
            }
          ) as HTMLSpanElement
          switchContainer.appendChild(optionNode)
        }
      }
      switchContainer.style.opacity = "1"
      if (timeout > 0) {        
        optionTimer = window.setTimeout(() => {
          switchContainer.style.opacity = "0"
        }, timeout)
      }
    }

    // toolbar UI
    const toolbar = document.querySelector("#zotero-items-toolbar") as XUL.Element
    toolbar.onmouseenter = () => {
      if (!Zotero[config.addonInstance]) { return }
      updateOptionNode(-1)
    }
    toolbar.onmouseleave = () => {
      if (!Zotero[config.addonInstance]) { return }
      switchContainer.style.opacity = "0"
    }
    const switchContainer = toolbar.insertBefore(
      ztoolkit.UI.createElement(
        document,
        "div",
        {
          styles: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            opacity: "0",
            transition: "opacity .23s linear"
          }
        }
      ) as HTMLElement,
      toolbar.querySelector("#zotero-tb-search-spinner")
    )
    toolbar.insertBefore(
      ztoolkit.UI.createElement(
        document,
        "spacer",
        {
          namespace: "xul",
          attributes: {
            flex: "1"
          }
        }
      ) as XUL.Spacer,
      toolbar.querySelector("#zotero-tb-search-spinner")
    );
    [",", "."].forEach((key: string, keyIndex: number) => {
      ztoolkit.Shortcut.register(
        "event",
        {
          id: `zotero-style-column-view-switch-${key}`,
          key,
          modifiers: "alt",
          callback: () => {
            const columnsViews = JSON.parse(Zotero.Prefs.get(prefKey) as string) as ColumnsView[]
            let index = columnsViews.findIndex(c => isCurrent(c))
            if (index == -1) {
              index = 0
            } else {
              index += (keyIndex == 0 ? -1 : 1)
              if (index < 0) {
                index = columnsViews.length + index
              } else if (index >= columnsViews.length) {
                index -= columnsViews.length
              }
            }
            switchColumnsView(columnsViews[index]);
            window.setTimeout(() => {              
              updateOptionNode(1000, index)
            })
          }
        }
      )
    })

    // menu UI
    const sign = "zoterostyle-registerSwitchColumnsViewUI"
    if (ZoteroPane.itemsView[sign]) { return }
    ztoolkit.patch(
      ZoteroPane.itemsView,
      "_displayColumnPickerMenu",
      sign,
      (original) =>
        function () {
          original.apply(ZoteroPane.itemsView, arguments);
          if (!Zotero.ZoteroStyle) { return }
          let sort = (columnsViews: ColumnsView[]) => {
            return columnsViews.sort((a: ColumnsView, b: ColumnsView) => Number(a.position) - Number(b.position))
          }
          let addUpdateView = (columnsView: ColumnsView, label: string = "Add") => {
            dialog({
              attributes: { buttonlabelaccept: label, title: "New View"}, 
              element: ztoolkit.UI.createElement(
                document,
                "vbox",
                {
                  id: "container",
                  namespace: "xul",
                  children: [
                    {
                      tag: "label",
                      attributes: {
                        value: "Name"
                      }
                    },
                    {
                      tag: "textbox",
                      id: "view-name",
                      attributes: {
                        flex: "1",
                        value: columnsView.name
                      }
                    },
                    {
                      tag: "separator"
                    },
                    {
                      tag: "label",
                      attributes: {
                        value: "Position"
                      }
                    },
                    {
                      tag: "textbox",
                      id: "view-position",
                      attributes: {
                        flex: "1",
                        value: columnsView.position
                      }
                    },
                    {
                      tag: "separator"
                    },
                    {
                      tag: "label",
                      attributes: {
                        value: "Content"
                      }
                    },
                    {
                      tag: "textbox",
                      id: "view-content",
                      attributes: {
                        flex: "1",
                        multiline: "true",
                        rows: "4",
                        value: columnsView.content
                      }
                    }
                  ]
                }
              ),
              hooks: {
                accept: (_document: any) => {
                  let name = _document.querySelector("#view-name").value
                  let position = _document.querySelector("#view-position").value
                  let content = _document.querySelector("#view-content").value
                  let entries2object = (keyValues: [key: string, value: any][]) => {
                    let obj: any = {}
                    for (let keyValue of keyValues) {
                      obj[keyValue[0]] = keyValue[1]
                    }
                    return obj
                  }
                  const dataKeys = (
                    columnsView.dataKeys.length > 0 && columnsView.dataKeys
                  ) || getCurrentDataKeys();
                  const prefs = (
                    isCurrent(columnsView) &&
                    entries2object(
                      Object.values(ZoteroPane.itemsView.tree._columns._getPrefs())
                        .filter((i: any) => dataKeys.indexOf(i.dataKey) != -1)
                        .map((i: any)=>[i.dataKey, i])
                    )) || columnsView.prefs
                  if (name) { 
                    columnsViews.push({
                      name,
                      position,
                      content: content || name,
                      dataKeys,
                      prefs
                    })
                    columnsViews = sort(columnsViews)
                    Zotero.Prefs.set(prefKey, JSON.stringify(columnsViews))
                    updateOptionNode(1000)
                   }
                },
              }
            }, 350, 300)
          }
          let addButton = () => {
            if (document.querySelector("#add-save-item")) { return }
            let saveMenuItem = document.createElementNS(ns, "menuitem") as XUL.MenuItem
            saveMenuItem.setAttribute("label", getString("column.view.add"));
            saveMenuItem.setAttribute("id", "add-save-item")
            saveMenuItem.addEventListener("command", async () => {
              addUpdateView({
                name: "",
                position: "",
                content: "",
                dataKeys: []
              })
            })
            colViewPopup.appendChild(saveMenuItem)
          }
          const ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
          const menupopup = [...document.querySelectorAll("#zotero-column-picker")].slice(-1)[0]
          // 分割线
          let sep = document.createElementNS(ns, "menuseparator");
          menupopup.appendChild(sep);
          // 保存列视图菜单
          let colViewPrimaryMenu = document.createElementNS(ns, "menu") as XUL.Menu
          colViewPrimaryMenu.setAttribute("label", getString("column.view.group"))
          let colViewPopup = document.createElementNS(ns, "menupopup") as XUL.MenuItem
          colViewPrimaryMenu.appendChild(colViewPopup)

          // 获取已保存列视图
          let columnsViews = JSON.parse(Zotero.Prefs.get(prefKey) as string) as ColumnsView[]
          columnsViews = sort(columnsViews)
          let isAdded = false
          for (let columnsView of columnsViews) {
            let colViewItem = document.createElementNS(ns, "menuitem") as XUL.MenuItem
            colViewItem.setAttribute("colViewName", columnsView.name);
            colViewItem.setAttribute("label", columnsView.name);
            colViewItem.setAttribute("type", "checkbox");

            if (isCurrent(columnsView)) {
              colViewItem.setAttribute("checked", "true")
              isAdded = true
            }
            colViewItem.addEventListener("click", (event) => {
              if (event.button == 2) {
                // 鼠标右键删除
                columnsViews = columnsViews.filter(e => {
                  return !isSame(e.dataKeys, columnsView.dataKeys)
                })
                Zotero.Prefs.set(prefKey, JSON.stringify(columnsViews))
                colViewItem.remove()
                if (!colViewPopup.querySelector("menuitem[checked=true]")) {
                  addButton()
                }
                updateOptionNode(1000)
              } else if (event.button == 0) {
                // 等待mouseup事件结束
                switchColumnsView(columnsView)
              }
            })
            let pressTimer: number | undefined
            colViewItem.addEventListener("mousedown", (event) => {
              pressTimer = window.setTimeout(() => {
                // 重新编辑columnsView
                columnsViews = columnsViews.filter(e => {
                  return !isSame(e.dataKeys, columnsView.dataKeys)
                })
                addUpdateView(columnsView, "Update")
              }, 1000)
            })
            colViewItem.addEventListener("mouseup", (event) => {
              ztoolkit.log("mouseup", pressTimer)
              window.clearTimeout(pressTimer)
              pressTimer = undefined
              ztoolkit.log("mouseup", pressTimer)
            })
            colViewPopup.appendChild(colViewItem);
          }
          if (!isAdded) {
            addButton()
          }
          menupopup.appendChild(colViewPrimaryMenu)
        }
    )
    ZoteroPane.itemsView[sign] = true
  }

  /**
   * 右键一列弹出列设置窗口
   * @param colKey 
   * @param args 
   */
  public patchSetting(
    colKey: string,
    args: { prefKey: string, name: string, type: string, range?: number[], values?: string[]}[],
    width: number = 233
  ) {
    const sign = `zoterostyle-setting-${colKey}`
    if (ZoteroPane.itemsView[sign]) { return }
    const that = this;
    ztoolkit.patch(
      ZoteroPane.itemsView,
      "_displayColumnPickerMenu",
      sign,
      (original) =>
        function () {
          // @ts-ignore
          original.apply(ZoteroPane.itemsView, arguments);
          if (!Zotero.ZoteroStyle) { return }
          const menupopup = [...document.querySelectorAll("#zotero-column-picker")].slice(-1)[0]
          let left = menupopup.getBoundingClientRect().left
          let rect
          try {
            rect = document.querySelector(`.${colKey}-item-tree-main-default`)!.getBoundingClientRect()
          } catch { return }
          if (!(left > rect.left && left < rect.right)) { return }
          // 保存列视图菜单
          const ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
          let menuitem = document.createElementNS(ns, "menuitem") as XUL.Menu
          menuitem.setAttribute("label", getString("column.Setting"))
          menupopup.appendChild(menuitem)
          let prefs: { [key: string]: string | boolean } = {}
          let accept = (document: Document) => {
            for (let key in prefs) {
              ztoolkit.log(`${config.addonRef}.${key}`, prefs[key])
              Zotero.Prefs.set(`${config.addonRef}.${key}`, prefs[key])
            }
            that.addStyle()
            ztoolkit.ItemTree.refresh()
          }
          // 点击设置弹出对话框
          const eachHeight = 25
          menuitem.onclick = () => {
            // 根据args创建元素
            let element = ztoolkit.UI.createElement(
              document,
              "div",
              {
                namespace: "html",
                styles: {
                  dislay: "flex",
                  width: "100%",
                  height: "100%"
                },
                children: [
                  {
                    tag: "div",
                    id: "container",
                    namespace: "html",
                    styles: {
                      display: "flex",
                      flexDirection: "row",
                    },
                    children: [
                      {
                        tag: "div",
                        namespace: "html",
                        id: "name",
                        styles: {
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "end",
                          justifyContent: "space-between",
                          height: `${eachHeight * args.length}px`,
                        }
                      },
                      {
                        tag: "div",
                        namespace: "html",
                        id: "control",
                        styles: {
                          display: "flex",
                          width: "100%",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "space-between",
                          height: `${eachHeight * args.length}px`,
                        }
                      }
                    ]
                  }
                ]
              }
            ) as any
            for (let arg of args) {
              // 名称
              element.querySelector("#name")?.appendChild(
                ztoolkit.UI.createElement(
                  document,
                  "label",
                  {
                    namespace: "xul",
                    attributes: {
                      value: arg.name
                    }
                  }
                )
              )
              // 控制
              let prefValue = Zotero.Prefs.get(`${config.addonRef}.${arg.prefKey}`)
              ztoolkit.log(`${config.addonRef}.${arg.prefKey}`, prefValue )
              let id = arg.prefKey.replace(/\./g, "-")
              let vbox = element.querySelector("#control") as XUL.Box
              const width = "90%"
              let control
              switch (arg.type) {
                case "boolean":
                  // 创建选框
                  control = ztoolkit.UI.createElement(
                    document,
                    "checkbox",
                    {
                      namespace: "xul",
                      id,
                      attributes: {
                        checked: prefValue as boolean,
                      },
                      listeners: [
                        {
                          type: "click",
                          listener: function () {
                            // 这个要快一点，所以如果当前是true点击后会变成false
                            //@ts-ignore
                            prefs[arg.prefKey] = this.getAttribute("checked") != "true"
                          }
                        }
                      ]
                    }
                  )
                  break
                case "select":
                  ztoolkit.log(arg.values!.indexOf(prefValue as string), arg.values, prefValue)
                  control = ztoolkit.UI.createElement(
                    document,
                    "select",
                    {
                      namespace: "html",
                      id,
                      styles: {
                        width: width
                      },
                      listeners: [
                        {
                          type: "change",
                          listener: function () {
                            //@ts-ignore
                            prefs[arg.prefKey] = arg.values[this.selectedIndex]
                          }
                        }
                      ],
                      children: (() => {
                        let arr = []
                        for (let value of arg.values!) {
                          arr.push(
                            {
                              tag: "option",
                              attributs: {
                                value: value
                              },
                              directAttributes: {
                                innerText: value
                              },
                              listeners: [
                                {
                                  type: "click",
                                  listener: function () {
                                    //@ts-ignore
                                    this.parentNode.setAttribute("value", value)
                                  }
                                }
                              ]
                            }
                          )
                        }
                        return arr
                      })()
                    }
                  )
                  control.selectedIndex = arg.values!.indexOf(prefValue as string) 
                  break
                case "range":
                  control = ztoolkit.UI.createElement(
                    document,
                    "input",
                    {
                      namespace: "html",
                      id,
                      styles: {
                        width: width
                      },
                      attributes: {
                        label: arg.name,
                        type: "range",
                        min: arg.range![0],
                        max: arg.range![1],
                        step: arg.range![2],
                        value: prefValue as string
                      },
                      listeners: [
                        {
                          type: "change",
                          listener: function () {
                            //@ts-ignore
                            prefs[arg.prefKey] = this.value
                          }
                        }
                      ],
                    }
                  )
                  break
                default:
                  control = ztoolkit.UI.createElement(
                    document,
                    "input",
                    {
                      tag: "input",
                      id,
                      styles: {
                        width: width
                      },
                      namespace: "html",
                      attributes: {
                        type: "text",
                        value: prefValue as string
                      },
                      listeners: [
                        {
                          type: "keyup",
                          listener: function () {
                            //@ts-ignore
                            prefs[arg.prefKey] = this.value
                          }
                        },
                        {
                          type: "blur",
                          listener: function () {
                            //@ts-ignore
                            prefs[arg.prefKey] = this.value
                          }
                        }
                      ]
                    }
                  )
              }
              vbox.appendChild(control)
            }
            // 对话框
            dialog({
              attributes: {
                buttonlabelaccept: "Set",
                title: colKey.charAt(0).toUpperCase() + colKey.slice(1)
              }, 
              element: element,
              hooks: { accept }
            }, width, (args.length + 2.5) * eachHeight
            )
          }
        }
    )
    ZoteroPane.itemsView[sign] = true
  }

  /**
   * 关系图谱
   * Obsidian
   */
  public async createGraphView() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.graphView.enable`) as boolean) { return }
    await (new GraphView()).init();

  }

  /**
   * 注册Prompt命令
   */
  public async registerCommands() {
    // 注册搜索文库
    ztoolkit.Prompt.register([{
      id: "search",
      when: () => {
        const inputNode = document.querySelector(".prompt-input") as HTMLInputElement
        return !inputNode.value.startsWith("> ")
      },
      callback: async (prompt) => {
        // https://github.com/zotero/zotero/blob/7262465109c21919b56a7ab214f7c7a8e1e63909/chrome/content/zotero/integration/quickFormat.js#L589
        function getItemDescription(item: Zotero.Item) {
          var nodes = [];
          var str = "";
          var author, authorDate = "";
          if (item.firstCreator) { author = authorDate = item.firstCreator; }
          var date = item.getField("date", true, true) as string;
          if (date && (date = date.substr(0, 4)) !== "0000") {
            authorDate += " (" + parseInt(date) + ")";
          }
          authorDate = authorDate.trim();
          if (authorDate) nodes.push(authorDate);

          var publicationTitle = item.getField("publicationTitle", false, true);
          if (publicationTitle) {
            nodes.push(`<i>${publicationTitle}</i>`);
          }
          var volumeIssue = item.getField("volume");
          var issue = item.getField("issue");
          if (issue) volumeIssue += "(" + issue + ")";
          if (volumeIssue) nodes.push(volumeIssue);

          var publisherPlace = [], field;
          if ((field = item.getField("publisher"))) publisherPlace.push(field);
          if ((field = item.getField("place"))) publisherPlace.push(field);
          if (publisherPlace.length) nodes.push(publisherPlace.join(": "));

          var pages = item.getField("pages");
          if (pages) nodes.push(pages);

          if (!nodes.length) {
            var url = item.getField("url");
            if (url) nodes.push(url);
          }

          // compile everything together
          for (var i = 0, n = nodes.length; i < n; i++) {
            var node = nodes[i];

            if (i != 0) str += ", ";

            if (typeof node === "object") {
              var label = document.createElement("label");
              label.setAttribute("value", str);
              label.setAttribute("crop", "end");
              str = "";
            } else {
              str += node;
            }
          }
          str.length && (str += ".")
          return str
        };
        function filter(ids: number[]) {
          ids = ids.filter(async (id) => {
            const item = await Zotero.Items.getAsync(id)
            return item.isRegularItem() && !item.isFeedItem
          })
          return ids
        }
        const text = prompt.inputNode.value;
        prompt.showTip("Searching...")
        const s = new Zotero.Search();
        s.addCondition("quicksearch-titleCreatorYear", "contains", text);
        s.addCondition("itemType", "isNot", "attachment");
        let ids = await s.search();
        // prompt.exit will remove current container element.
        // @ts-ignore
        prompt.exit();
        const container = prompt.createCommandsContainer();
        container.classList.add("suggestions");
        ids = filter(ids)
        ztoolkit.log(ids.length)
        if (ids.length == 0) {
          const s = new Zotero.Search();
          const operators = ['is', 'isNot', 'true', 'false', 'isInTheLast', 'isBefore', 'isAfter', 'contains', 'doesNotContain', 'beginsWith'];
          let hasValidCondition = false
          let joinMode: string = "all"
          if (/\s*\|\|\s*/.test(text)) {
            joinMode = "any"
          }
          text.split(/\s*(&&|\|\|)\s*/g).forEach((conditinString: string) => {
            let conditions = conditinString.trim().match(/([^\s]+?)\s+([^\s]+?)\s+(.+)/)!;
            if (conditions.length == 4 && operators.indexOf(conditions[2]) != -1) {
              hasValidCondition = true
              s.addCondition("joinMode", joinMode);
              s.addCondition(
                conditions[1],
                conditions[2],
                conditions[3]
              );
            }
          })
          if (hasValidCondition) {
            ids = await s.search();
          }
        }
        ids = filter(ids)
        ztoolkit.log(ids.length)
        if (ids.length > 0) {
          ids.forEach((id: number) => {
            const item = Zotero.Items.get(id)
            const title = item.getField("title")
            const ele = ztoolkit.UI.createElement(document, "div", {
              namespace: "html",
              classList: ["command"],
              listeners: [
                {
                  type: "mousemove",
                  listener: function () {
                    // @ts-ignore
                    prompt.selectItem(this)
                  }
                },
                {
                  type: "click",
                  listener: () => {
                    prompt.promptNode.style.display = "none"
                    Zotero_Tabs.select('zotero-pane');
                    ZoteroPane.selectItem(item.id);
                  }
                }
              ],
              styles: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "start",
              },
              children: [
                {
                  tag: "span",
                  styles: {
                    fontWeight: "bold",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"

                  },
                  properties: {
                    innerText: title
                  }
                },
                {
                  tag: "span",
                  styles: {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  },
                  properties: {
                    innerHTML: getItemDescription(item)
                  }
                }
              ]
            })
            container.appendChild(ele)
          })
        } else {
          // @ts-ignore
          prompt.exit()
          prompt.showTip("Not Found.")
        }
      }
    }])
    // 旧版数据迁移
    let getItem = () => {
      let readingItem = Zotero.Items.get(
        Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)?.itemID
      ).parentItem
      let selectedItems = ZoteroPane.getSelectedItems()
      if (!(readingItem || (selectedItems.length == 1))) { return }
      let item = readingItem || selectedItems[0]
      return item
    }
    let getAllTags = (item: _ZoteroItem) => {
      let coloredTags = item.getColoredTags()
      let tags = item.getTags().filter((tag: any) => coloredTags.map((tag: any) => tag.tag).indexOf(tag.tag) == -1)
      return [...coloredTags, ...tags]
    }
    ztoolkit.Prompt.register([
      {
        name: "高能进度条",
        label: "Style",
        when: () => {
          // 有条目，且条目有阅读时间
          let item = getItem()
          if (!item) { return false }
          let record = this.storage.get(item, "readingTime")
          ztoolkit.log(record)
          return Zotero.Prefs.get(`${config.addonRef}.function.titleColumn.enable`) as boolean && record?.data && Object.keys(record.data).length > 0 
        },
        /**
         * 进度条UI，重置
         */
        callback: (prompt) => {
          const container = prompt.createCommandsContainer()
          const item = getItem() as _ZoteroItem
          prompt.inputNode.placeholder = item.getField("title")
          const record = this.storage.get(item, "readingTime")
          if (!record || !record.data || Object.keys(record.data).length == 0) {
            prompt.showTip("这里一片荒芜~")
            return
          }
          const box = ztoolkit.UI.createElement(document, "div", {
            styles: {
              display: "flex",
              alignContent: "baseline",
              justifyContent: "space-between",
              borderRadius: "5px",
              padding: "6px 12px",
              marginRight: "12px",
              marginTop: "2px",
              marginBottom: "2px",
              height: "2em",
            }
          })
          let values: number[] = []
          for (let i = 0; i < record.page; i++) {
            values.push(parseFloat(record.data[i] as string) || 0)
          }
          const color = Zotero.Prefs.get(
            `${config.addonRef}.titleColumn.color`
          ) as string;
          const opacity = Zotero.Prefs.get(
            `${config.addonRef}.titleColumn.opacity`
          ) as string
          const span = this.progress.opacity(
            values,
            color,
            opacity
          );
          let openToPage = async (page: number) => {
            let pdfItem = await item.getBestAttachment();
            if (!pdfItem) { return }
            await Zotero.OpenPDF.openToPage(pdfItem, page)
          };
          [...span.querySelectorAll("span")].forEach((span: HTMLSpanElement, index: number) => {
            span.style.cursor = "pointer"
            let page = index + 1;
            span.onclick = () => {
              openToPage(page)
            }
            let b1: Bubble, b2: Bubble, c1: number, c2: number
            span.onmouseenter = () => {
              span.style.border = "2px solid white"

              let sec = values[index]
              let t
              if (sec < 60) {
                t = `${sec} s`
              } else if (sec / 60) {
                t = `${(sec / 60).toFixed(1)} m`
              } else {
                t = `${(sec / 60 / 60).toFixed(1)} h`
              }
              b2 = new Bubble(span, "bubble-time", `${t}`, "top")
              b1 = new Bubble(span, "bubble-page", `${page}`, "bottom")
            }
            span.onmouseleave = () => {
              span.style.border = ""
              const t = 0
              c1 = window.setTimeout(() => {
                b1.ele.remove()
              }, t)
              c2 = window.setTimeout(() => {
                b2.ele.remove()
              }, t)
              b1.ele.setAttribute("closeTimer", String(c1))
              b2.ele.setAttribute("closeTimer", String(c2))
            }

          })
          box.appendChild(span)
          container.appendChild(box)


        }
      },
      {
        name: "迁移旧版数据",
        label: "Style",
        when: () => {
          let items = ZoteroPane.getSelectedItems()
          return items.length == 1 && items[0].getField("title") == "ZoteroStyle"
        },
        callback: async (prompt) => {
          // 迁移数据逻辑
          const tipNode = prompt.showTip("感谢您长时间对Style的支持，数据正在迁移中，请耐心等待！")
          tipNode.style.position = "relative"
          let progress = ztoolkit.UI.createElement(
            document,
            "span",
            {
              styles: {
                position: "absolute",
                height: "100%",
                left: "0",
                top: "0",
                backgroundColor: "#FF8E9E",
                zIndex: "-1",
                opacity: "0.5",
                transition: "width .1 linear"
              }
            }
          )
          tipNode.appendChild(progress)

          progress.style.width = "0%"
          // 迁移逻辑
          let ids = ZoteroPane.getSelectedItems()[0].getNotes()
          let totalTime = 0
          for (let i = 0; i < ids.length; i++) {
            let noteItem = Zotero.Items.get(ids[i])
            try {
              let data = JSON.parse((noteItem.note.replace(/<.+?>/g, "").replace(/[^\n\{]+/, "")))
              // 没有itemKey，搜索本地
              if (!data.itemKey) {
                let s = new Zotero.Search();
                s.addCondition("title", "contains", data.title);
                data.itemKey = Zotero.Items.get((await s.search())[0]).key
                ztoolkit.log(data.itemKey)
              }
              totalTime += (Object.values(data.pageTime) as Array<number>).reduce((a, b) => a + b)
              let record = {
                page: data.pageNum,
                data: data.pageTime,
              }
              // 写入笔记逻辑
              if (data.itemKey) {
                this.storage.set(
                  Zotero.Items.getByLibraryAndKey(1, data.itemKey),
                  "readingTime",
                  record
                )
              }
            } catch { }
            progress.style.width = `${i / ids.length * 100}%`
            prompt.inputNode.value = `[Pending] ${i}/${ids.length}`
            await Zotero.Promise.delay(10)
          }
          prompt.inputNode.value = ""
          // @ts-ignore
          prompt.exit()
          prompt.showTip(
            `数据迁移完成!\n\n` +
            `从安装Style开始，它与您共同阅读了${ids.length}篇文献，总用时${(totalTime / 60 / 60).toFixed(2)}小时。\n\n` +
            `你走过的路，每一步都算数。`
          )
        }
      },
      {
        name: "标签",
        label: "Style",
        when: () => {
          let item = getItem() as _ZoteroItem
          if (item) {
            if (getAllTags(item).length > 0) {
              return true
            }
          }
          return false
        },
        callback: (prompt) => {
          const libraryID = 1
          // 重命名标签
          // Zotero.Tags.rename(libraryID, oldName, newName);
          // 指派颜色位置
          // Zotero.Tags.setColor()

          const container = prompt.createCommandsContainer()
          const tags = getAllTags(getItem() as _ZoteroItem)
          const inputStyles = {
            height: "2em",
            border: "1px solid #eee",
            borderRadius: ".1em",
            padding: "0 0.5em"
          }
          tags.forEach((tag: { tag: string, color?: string }) => {
            let position = Zotero.Tags.getColor(libraryID, tag.tag)?.position
            position = position == undefined ? undefined : position + 1
            let set = (line: HTMLElement) => {
              const name = (line.querySelector("#name") as HTMLInputElement).value
              const color = (line.querySelector("#color") as HTMLInputElement).value
              const position = (line.querySelector("#position") as HTMLInputElement).value
              if (/^#(\w{3}|\w{6})$/i.test(color) && /^\d+$/.test(position) && name.length)
                Zotero.Tags.setColor(libraryID, name, color, position)
            }
            const line = ztoolkit.UI.createElement(
              document,
              "div",
              {
                classList: ["command"],
                styles: {
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-around",
                  alignItems: "center",
                  width: "100%",
                },
                children: [
                  {
                    tag: "span",
                    id: "circle",
                    styles: {
                      display: "inline-block",
                      height: ".7em",
                      width: ".7em",
                      borderRadius: tag.tag.startsWith("#") ? ".1em" : ".7em",
                      backgroundColor: tag.color as string,
                    }
                  },
                  {
                    tag: "div",
                    children: [
                      {
                        tag: "input",
                        id: "name",
                        styles: inputStyles,
                        properties: {
                          value: tag.tag,
                          placeholder: "Name"
                        },
                        listeners: [
                          {
                            type: "change",
                            listener: () => {
                              Zotero.Tags.rename(libraryID, tag.tag,
                                (line.querySelector("#name") as HTMLInputElement).value as string
                              );
                            }
                          }
                        ]
                      }
                    ]
                  },
                  {
                    tag: "div",
                    styles: {
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center"
                    },
                    children: [
                      {
                        tag: "input",
                        id: "color",
                        styles: inputStyles,
                        properties: {
                          value: tag.color || "",
                          placeholder: "Color"
                        },
                        listeners: [
                          {
                            type: "change",
                            listener: () => {
                              ztoolkit.log((line.querySelector("#circle")! as HTMLElement)
                                .style.backgroundColor);
                              (line.querySelector("#circle")! as HTMLElement)
                                .style.backgroundColor = (line.querySelector("#color")! as HTMLInputElement).value
                              ztoolkit.log((line.querySelector("#circle")! as HTMLElement)
                                .style.backgroundColor);
                              if (!/^\d+$/.test((line.querySelector("#position") as HTMLInputElement).value)) {
                                (line.querySelector("#position") as HTMLInputElement).value = "1"
                              }
                              set(line)
                            }
                          }
                        ]
                      }
                    ]
                  },
                  {
                    tag: "div",
                    children: [
                      {
                        tag: "input",
                        id: "position",
                        styles: inputStyles,
                        properties: {
                          value: position,
                          placeholder: "Position"
                        },
                        listeners: [
                          {
                            type: "change",
                            listener: () => {
                              set(line)
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            )
            container.appendChild(line)
          })
        }
      },
      {
        /**
         * 实现标注颜色组，可以新创建新组，组内可以新建新的标注颜色
         */
        name: "标注",
        label: "Style",
        when: () => {
          return Zotero.Prefs.get(`${config.addonRef}.function.annotationColors.enable`) as boolean
        },
        callback: (prompt: Prompt) => {
          const container = prompt.createCommandsContainer()
          type Name = string;
          type Color = string;
          type Annotation = [Name, Color];
          type Group = [string, Annotation[]];

          // 从prefs初始化
          // [标注组名称，[[颜色名称, 颜色], [颜色名称, 颜色]]]
          let groups: Group[]= JSON.parse(Zotero.Prefs.get(`${config.addonRef}.annotationColorsGroups`) as string)
          // [[颜色名称, 颜色], [颜色名称, 颜色]]
          // let defaultAnno: Annotation[] = JSON.parse(Zotero.Prefs.get(`${config.addonRef}.annotationColors`) as string)
          let defaultAnno: Annotation[] = [
            ['general.yellow', '#ffd400'],
            ['general.red', '#ff6666'],
            ['general.green', '#5fb236'],
            ['general.blue', '#2ea8e5'],
            ['general.purple', '#a28ae5'],
            ['general.magenta', '#e56eee'],
            ['general.orange', '#f19837'],
            ['general.gray', '#aaaaaa']
          ];
          const svg = `<svg t="1675648090111" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2675" width="20" height="20" style="height: 100%;"><path d="M863.328262 481.340895l-317.344013 0.099772L545.984249 162.816826c0-17.664722-14.336138-32.00086-32.00086-32.00086s-31.99914 14.336138-31.99914 32.00086l0 318.400215-322.368714-0.17718c-0.032684 0-0.063647 0-0.096331 0-17.632039 0-31.935493 14.239806-32.00086 31.904529-0.096331 17.664722 14.208843 32.031824 31.871845 32.095471l322.59234 0.17718 0 319.167424c0 17.695686 14.336138 32.00086 31.99914 32.00086s32.00086-14.303454 32.00086-32.00086L545.982529 545.440667l317.087703-0.099772c0.063647 0 0.096331 0 0.127295 0 17.632039 0 31.935493-14.239806 32.00086-31.904529S880.960301 481.404542 863.328262 481.340895z" fill="#575B66" p-id="2676"></path></svg>`
          ztoolkit.log(groups, defaultAnno)
          const inputStyles = {
            height: "22.4px",
            border: "1px solid #eee",
            borderRadius: ".1em",
            padding: "0 0.5em"
          }
          let copy = (obj: any) => {
            return JSON.parse(JSON.stringify(obj))
          }
          let saveGroups = (groups: Group[]) => {
            Zotero.Prefs.set(`${config.addonRef}.annotationColorsGroups`, JSON.stringify(groups))
          }
          let saveAnnotations = (anno: Annotation[]) => {
            Zotero.Prefs.set(`${config.addonRef}.annotationColors`, JSON.stringify(anno))
            window.setTimeout(async () => {
              const reader = await ztoolkit.Reader.getReader()
              reader && this.modifyAnnotationColors(reader)
            })
          }
          /**
           * 将colorsGroup渲染到groupContainer
           * @param colorsGroup 
           */
          let timer: Number | undefined
          let updateGroups = () => {
            saveGroups(groups)
            container.querySelectorAll(".command").forEach(e => e.remove())
            // 已创建的标注颜色
            for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
              const group = groups[groupIndex]
              ztoolkit.UI.appendElement(
                {
                  tag: "div",
                  classList: ["command"],
                  styles: {
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                  },
                  listeners: [
                    {
                      type: "mousemove",
                      listener: function () {
                        // @ts-ignore
                        prompt.selectItem(this);
                      },
                    },
                  ],
                  children: [
                    {
                      tag: "span",
                      id: "group-name",
                      properties: {
                        innerText: group[0],
                      },
                      listeners: [
                        {
                          type: "click",
                          listener: function (event) {
                            event.stopPropagation()
                            event.preventDefault()
                            // 单击名称变为可输入状态更改名称
                            // @ts-ignore
                            const spanNode = this as HTMLSpanElement;
                            const inputNode = spanNode.nextSibling as HTMLInputElement;
                            spanNode.style.display = "none"
                            inputNode.style.display = ""
                          }
                        }
                      ],
                      styles: {
                        borderRadius: "5px",
                        backgroundColor: JSON.stringify(group[1]) == Zotero.Prefs.get(`${config.addonRef}.annotationColors`)
                          ? "rgba(244, 132, 132, 0.3)" : "none",
                        padding: "0 .5em",
                        fontSize: ".9em"
                      }
                    },
                    {
                      tag: "input",
                      listeners: [
                        {
                          type: "keyup",
                          listener: function () {
                            // @ts-ignore
                            const inputNode = this as HTMLInputElement;
                            group[0] = inputNode.value;
                            save()
                          }
                        },
                        {
                          type: "blur",
                          listener: function () {
                            // @ts-ignore
                            const inputNode = this as HTMLInputElement;
                            group[0] = inputNode.value;
                            const spanNode = inputNode.previousSibling as HTMLSpanElement;
                            spanNode.style.display = ""
                            spanNode.innerText = inputNode.value
                            inputNode.style.display = "none"
                            save()
                          }
                        }
                      ],
                      styles: {
                        display: "none",
                        width: "20%",
                        ...inputStyles,
                      },
                      attributes: {
                        value: group[0],
                        placeholder: "Name"
                      },
                    },
                    {
                      tag: "div",
                      listeners: [
                        {
                          type: "mousedown",
                          listener: async (event: any) => {
                            if (event.button == 0) {
                              // 长按进入编辑，短按使用
                              timer = window.setTimeout(() => {
                                timer = undefined
                                editAnnotations(group)
                              }, 1000)
                            } else if (event.button == 2) {
                              // 单击右键删除
                              groups.splice(groupIndex, 1)
                              updateGroups()
                            }
                          },
                        },
                        {
                          type: "mouseup",
                          listener: async (event: any) => {
                            if (event.button == 0) {
                              if (timer) {
                                // 长按事件未达到，执行选中
                                window.clearTimeout(timer as number)
                                saveAnnotations(group[1])

                                updateGroups()
                              }
                            }
                          },
                        }
                      ],
                      styles: {
                        display: "flex",
                        flexDirection: "row",
                        aliginItems: "center",
                        justifyContent: "space-around",
                        width: "80%",
                      },
                      children: (() => {
                        let children: any[] = []
                        for (let anno of group[1]) {
                          children.push({
                            tag: "span",
                            id: "circle",
                            attributes: {
                              title: anno[0]
                            },
                            styles: {
                              display: "inline-block",
                              height: ".7em",
                              width: ".7em",
                              borderRadius: ".1em",
                              backgroundColor: anno[1],
                              margin: "0 auto"
                            }
                          })
                        }
                        return children
                      })()
                    }
                  ]
                },
                container
              )
            }
            // 新增按钮
            container.appendChild(ztoolkit.UI.createElement(document, "div", {
              classList: ["command"],
              styles: {
                color: "rgba(0, 0, 0, 0.4)"
              },
              listeners: [
                {
                  type: "mousemove",
                  listener: function () {
                    // @ts-ignore
                    prompt.selectItem(this);
                  },
                },
                {
                  type: "click",
                  listener: async () => {
                    // 新建标注颜色
                    groups.push(["Untitled", copy(defaultAnno)])
                    updateGroups()
                    let node = [...container.querySelectorAll(".command")].slice(-2)[0];
                    (node.querySelector("#group-name") as HTMLSpanElement).click()
                  },
                },
              ],
              children: [
                {
                  tag: "div",
                  styles: {
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    textAlign: "center"
                  },
                  properties: {
                    innerHTML: svg,
                  }
                }
              ]
            }))
          }
          updateGroups()

          /**
           * 编辑长按选中的标注颜色
           * 可以删除，但最少要保留两个颜色，只剩下两个颜色删除是无效的
           * @param annotationColors 
           */
          let editAnnotations = (group: Group) => {
            let annotations: Annotation[] = group[1]
            const container = prompt.createCommandsContainer()
            const isUsed = JSON.stringify(annotations) == Zotero.Prefs.get(`${config.addonRef}.annotationColors`)
            ztoolkit.log(isUsed)
            /**
             * 根据anno创建ele
             * @param anno [标注名称, 标注颜色]
             * @param index 用于删除
             * @returns 
             */
            let create = (anno: string[], index: number) => {
              const ele = ztoolkit.UI.createElement(
                document,
                "div",
                {
                  classList: ["command"],
                  listeners: [
                    {
                      type: "mousemove",
                      listener: function () {
                        // @ts-ignore
                        prompt.selectItem(this);
                      },
                    },
                    {
                      type: "mouseup",
                      listener: async (event: any) => {
                        if (event.button == 2) {
                          // 单击右键删除
                          if (annotations.length > 2) {
                            annotations.splice(index, 1)
                            ele.remove()
                            isUsed && saveAnnotations(annotations)
                            updateGroups()
                          }
                        }
                      },
                    }
                  ],
                  styles: {
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-around",
                    alignItems: "center",
                    width: "100%",
                  },
                  children: [
                    {
                      tag: "span",
                      id: "circle",
                      styles: {
                        display: "inline-block",
                        height: ".7em",
                        width: ".7em",
                        borderRadius: ".1em",
                        backgroundColor: anno[1] as string,
                      }
                    },
                    {
                      tag: "div",
                      children: [
                        {
                          tag: "input",
                          id: "name",
                          styles: inputStyles,
                          properties: {
                            value: anno[0],
                            placeholder: "Name"
                          },
                          listeners: [
                            {
                              type: "change",
                              listener: () => {
                                let name = anno[0] = (ele.querySelector("#name") as HTMLInputElement).value
                                isUsed && saveAnnotations(annotations)
                                updateGroups()
                                ztoolkit.log(name)
                              }
                            }
                          ]
                        }
                      ]
                    },
                    {
                      tag: "div",
                      styles: {
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center"
                      },
                      children: [
                        {
                          tag: "input",
                          id: "color",
                          styles: inputStyles,
                          properties: {
                            value: anno[1],
                            placeholder: "Color"
                          },
                          listeners: [
                            {
                              type: "change",
                              listener: () => {
                                let color = anno[1] = (ele.querySelector("#color") as HTMLInputElement).value
                                ztoolkit.log(color)
                                isUsed && saveAnnotations(annotations)
                                ele.querySelector("#circle")!.style.backgroundColor = color
                                updateGroups()
                              }
                            }
                          ]
                        }
                      ]
                    },
                  ]
                }
              )
              return ele
            }
            annotations.forEach((anno, index) => {
              container.appendChild(create(anno, index))
            })
            // 增加一个创建按钮
            const ele = ztoolkit.UI.createElement(document, "div", {
              classList: ["command"],
              styles: {
                color: "rgba(0, 0, 0, 0.4)"
              },
              listeners: [
                {
                  type: "mousemove",
                  listener: function () {
                    // @ts-ignore
                    prompt.selectItem(this);
                  },
                },
                {
                  type: "click",
                  listener: async () => {
                    const anno: Annotation = copy(defaultAnno[0]);
                    annotations.push(anno)
                    container.insertBefore(create(anno, annotations.length), ele)
                    isUsed && saveAnnotations(annotations)
                    updateGroups()
                  },
                },
              ],
              children: [
                {
                  tag: "div",
                  styles: {
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    textAlign: "center"
                  },
                  properties: {
                    innerHTML: svg,
                  }
                }
              ]
            })
            container.appendChild(ele)
          } 

        }
      },
      {
        name: "期刊标签",
        label: "Style",
        callback: (prompt) => {
          let secretKey = Zotero.Prefs.get(`${config.addonRef}.easyscholar.secretKey`) as string
          const container = prompt.createCommandsContainer()
          ztoolkit.UI.appendElement({
            tag: "div",
            styles: {
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
            },
            children: [
              {
                tag: "input",
                id: "secretKey",
                properties: {
                  value: secretKey,
                  placeholder: "Easyscholar SecretKey"
                },
                styles: {
                  height: "2em",
                  border: "1px solid #eee",
                  borderRadius: ".1em",
                  padding: "0 0.5em",
                  margin: "1em auto",
                  width: "50%",
                  textAlign: "center"
                }
              },
              {
                tag: "div",
                styles: {
                  height: "2em",
                  width: "8em",
                  borderRadius: "20px",
                  textAlign: "center",
                  border: "1px solid white",
                  lineHeight: "1.7em",
                  fontSize: "1em",
                  color: "white",
                  fontWeight: "bold",
                  margin: ".5em auto",
                  backgroundColor: "#BFACE2",
                  cursor: "pointer"
                },
                properties: {
                  innerText: "Help"
                },
                listeners: [
                  {
                    type: "click",
                    listener: () => {
                      new ztoolkit.ProgressWindow("提示", { closeOtherProgressWindows: true, closeTime: 3000 })
                        .createLine({ text: "已为您在浏览器打开申请密钥教程，请参考配置", type:"default" })
                        .show()
                      Zotero.launchURL("https://github.com/MuiseDestiny/zotero-style/releases/tag/2.5.1")
                      Zotero.launchURL("http://xhslink.com/d5E72o")
                    }
                  }
                ]
              },
              {
                tag: "div",
                styles: {
                  height: "2em",
                  width: "8em",
                  borderRadius: "20px",
                  textAlign: "center",
                  border: "1px solid white",
                  lineHeight: "1.7em",
                  fontSize: "1em",
                  color: "white",
                  fontWeight: "bold",
                  margin: ".5em auto",
                  backgroundColor: "#BA90C6",
                  cursor: "pointer"
                },
                properties: {
                  innerText: "Update"
                },
                listeners: [
                  {
                    type: "click",
                    listener: async () => {
                      Zotero.Prefs.set(`${config.addonRef}.easyscholar.secretKey`,
                        (container.querySelector("#secretKey") as HTMLInputElement).value as string
                      ) as string
                      const selectedItems = ZoteroPane.getSelectedItems()
                      const sortedItems = ZoteroPane.getSortedItems()
                      let items = selectedItems.length > 1 ? selectedItems : sortedItems
                      const state = { fail: 0, no: 0, success: 0 }
                      const popupWin = new ztoolkit.ProgressWindow("Update PublicationTags", {closeOtherProgressWindows: true, closeTime: -1})
                        .createLine({ text: `[0/0/0/${items.length}] 1%`, progress: 1 })
                        .show()
                      for (let i = 0; i < items.length;i++) {
                        const flag = await updatePublicationTags(this.localStorage, items[i])
                        
                        if (flag == 1) {
                          state.success += 1
                        } else if(flag == 0){
                          state.no += 1
                        } else {
                          state.fail += 1
                        }
                        const progress = 100 * (i + 1) / items.length
                        const _progress = String(progress).split(".")[0]
                        popupWin.changeLine({ text: `[${state.success}/${state.no}/${state.fail}/${items.length}] ${_progress}%`, progress })
                      }
                      if (state.success > 0) {
                        popupWin.changeLine({type: "success"})
                      } else {
                        popupWin.changeLine({ type: "fail" })
                      }
                      popupWin.startCloseTimer(3000)
                    }
                  }
                ]
              }
            ]
          }, container)
        },
      },
      {
        name: "设置为插件储存条目",
        when: () => {
          let item = getItem()
          return item?.getField("title").includes("Addon") as boolean
        },
        callback: (prompt) => {
          let item = getItem() as _ZoteroItem
          Zotero.Prefs.set("Zotero.AddonItem.key", item.key)
          if ("item" in this.storage) {
            this.storage.item = item
          }
          prompt.showTip(`设置成功，该条目下有${item.getNotes().length}条记录。`)
        }
      }
    ])
  }

  /**
   * 修改PDF标注颜色
   */
  public modifyAnnotationColors(reader: _ZoteroReaderInstance) {
    // @ts-ignore
    let win = reader._iframeWindow.wrappedJSObject;
    var Zotero = ztoolkit.getGlobal("Zotero")
    if (!Zotero.Prefs.get(`${config.addonRef}.function.annotationColors.enable`) as boolean) { return }
    if (!win.document.querySelector(`script#${config.addonRef}`)) {
      let script = ztoolkit.UI.createElement(win.document, "script", {
        namespace: "html",
        id: config.addonRef,
        properties: {
          innerHTML: `
            let map = window.map ? window.map : Array.prototype.map
            Array.prototype.map = function (func) {
              try {
                let annotationColors = this
                if (
                  annotationColors.length > 0 &&
                  annotationColors.every(e=>e.length==2 && e[1].startsWith("#"))
                ) {
                  annotationColors.length = window._annotationColors.length;
                  console.log(window._annotationColors, annotationColors);
                  for (let i = 0; i < window._annotationColors.length;i++) {
                    annotationColors[i] = [window._annotationColors[i][0], window._annotationColors[i][1].toLowerCase()]
                  }
                }
              } catch (e) {console.log(e)}
              return map.call(this, func);
            }
          `
        }
      })
      win.document.querySelector("head")?.appendChild(script)
    }
    const annotationColors = Zotero.Prefs.get(`${config.addonRef}.annotationColors`)
    win.eval(`window._annotationColors = ${annotationColors}`)
  }

  /**
   * 监测Item点击
   */
  public async initItemSelectListener() {
    let getChildrenTarget = (event: any, nodes: any) => {
      const target = [...nodes].find((span: any) => {
        if (!span || !span.getBoundingClientRect) { return false }
        const rect = span.getBoundingClientRect()
        return (
          event.clientX >= rect.x &&
          event.clientX <= rect.x + rect.width &&
          event.clientY >= rect.y && 
          event.clientY <= rect.y + rect.height
        )
      })
      return target
    }
    const p = "#zotero-items-tree .virtualized-table-body"
    while (!document.querySelector(p)) {
      await Zotero.Promise.delay(10)
    }
    
    const table = document.querySelector(p)
    let lastKey: string, lastItemType: string, selectedItemType: string = "", icon: string
    this.filterFunctions.push((items: Zotero.Item[]) => {
      if (selectedItemType.length) {
        // 去除子条目
        let _items = items.filter((item: Zotero.Item) => {
          if (
            item.parentID &&
            items.find((_item: Zotero.Item) => item.parentID == _item.id)
          ) { return false }
          return item.itemType == selectedItemType
        })
        if (_items.length) {
          return _items
        } else {
          // 自动退出
          new ztoolkit.ProgressWindow("Exit", { closeOtherProgressWindows: true })
            .createLine({
              icon,
              text: selectedItemType,
            }).show()
          lastItemType = selectedItemType = ""
          // ZoteroPane.itemsView.refreshAndMaintainSelection()
        }
      }
      return items
    })
    table?.addEventListener("mousemove", (event) => {
      if (!(event.target as HTMLDivElement)!.classList.contains("selected")) { return }
      let items = ZoteroPane.getSelectedItems()
      if (items.length == 1) {
        const item = items[0]
        /**
         * 在待选择节点上移动
         */
        const target = getChildrenTarget(event, (event.target! as HTMLDivElement).childNodes) as HTMLSpanElement
        if (target?.classList.contains("Rating")) {
          const optionNodes = [...target.querySelectorAll("span.option")] as HTMLScriptElement[]
          let optionNode = getChildrenTarget(event, optionNodes)
          let index = optionNodes.indexOf(optionNode)
          let rate: number
          if (index == -1) {
            rate = Number(ztoolkit.ExtraField.getExtraField(item, "rate"))
          } else {
            rate = index + 1
          }
          const mark = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.mark`) as string
          const option = Zotero.Prefs.get(`${config.addonRef}.ratingColumn.option`) as string
          
          for (let i = 0; i < optionNodes.length; i++){
            if (i < rate) {
              optionNodes[i].innerText = mark
            } else {
              optionNodes[i].innerText = option
            }
          }
        }
      }
    })
    table?.addEventListener("click", async (event: any) => {
      const target = getChildrenTarget(event, (event.target! as HTMLDivElement).childNodes)
      if (target?.classList.contains("PublicationTags")) {
        try {
          let item = ZoteroPane.getSelectedItems()[0]
          let publicationTitle = getPublicationTitle(item)
          if (!publicationTitle) {
            console.log("No publicationTitle")
          } else {
            new ztoolkit.ProgressWindow("Publication Tags", {closeTime: 3000})
              .createLine({ text: publicationTitle, type: "default" }).show()
            updatePublicationTags(this.localStorage, item, true)
            ztoolkit.ItemTree.refresh()
          }
        } catch {}
      }
      /**
       * 2 选中一个条目后再点击触发
       */
      let items = ZoteroPane.getSelectedItems()
      if (items.length == 1) {
        const item = items[0]
        if (lastKey == item.key) {
          /**
           * 2.1 评级
           */
          if (target?.classList.contains("Rating")) {
            const optionNodes = [...target.querySelectorAll("span.option")] as HTMLScriptElement[]
            let optionNode = getChildrenTarget(event, optionNodes)
            let index = optionNodes.indexOf(optionNode)
            const rate = Number(ztoolkit.ExtraField.getExtraField(item, "rate") || "0")
            if (index + 1 == rate) {
              await ztoolkit.ExtraField.setExtraField(item, "rate", String(index))
            } else {
              await ztoolkit.ExtraField.setExtraField(item, "rate", String(index + 1))
            }
          }
          /**
           * 2.2 点击条目类型icon触发
           */
          if (target?.classList.contains("title")) {
            let span = getChildrenTarget(event, target.childNodes)
            if (
              span.classList.contains("cell-icon") &&
              Zotero.Prefs.get(`${config.addonRef}.function.itemTypeFilter.enable`) as boolean
            ) {
              icon = span.style.backgroundImage.match(/url\("(.+)"\)/)[1]
              selectedItemType = item.itemType
              if (lastItemType != selectedItemType) {
                new ztoolkit.ProgressWindow("Select", { closeOtherProgressWindows: true })
                  .createLine({
                    icon,
                    text: selectedItemType,
                  }).show()
                lastItemType = selectedItemType
              } else {
                new ztoolkit.ProgressWindow("Exit", { closeOtherProgressWindows: true })
                  .createLine({
                    icon,
                    text: selectedItemType,
                  }).show()
                lastItemType = selectedItemType = ""
              }
              await ZoteroPane.itemsView.refreshAndMaintainSelection()
            }
          }
        } else {
          lastKey = item.key
        }
      }
    })
  }

  public async initTags() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.Tags.enable`) as boolean) { return }
    // 等待加载
    while (!ZoteroPane.tagSelector) {
      await Zotero.Promise.delay(100)
    }
    const tagsUI = new Tags();
    this.tagsUI = tagsUI;
    try {
      ztoolkit.patch(
        ZoteroPane.tagSelector,
        "render",
        config.addonRef,
        (original) => 
          () => {
            const res = original.apply(ZoteroPane.tagSelector)
            window.setTimeout(async () => {
              if (!((document.querySelector(".nested-tags-box") as HTMLDivElement)?.style.display == "none")) {
                await tagsUI.init();
              }
            })
            return res
          }
      )
    } catch {}
    window.setTimeout(async () => {
      await tagsUI.init();
    }, 1000)
    this.filterFunctions.push((items: Zotero.Item[]) => {
      tagsUI.collectionItems ??= items
      window.setTimeout(async () => {
        if (items.length == 0) {
          Object.keys(tagsUI.state).forEach((key: string) => tagsUI.state[key].select = false)
          await ZoteroPane.itemsView.refreshAndMaintainSelection();
          await tagsUI.init(true);
          return
        }
        if (tagsUI.nestedTagsContainer?.style.display != "none") {
          tagsUI.updateTagsIn(items)
          // @ts-ignore
          tagsUI.nestedTagsContainer?.querySelectorAll(".item").forEach(e => e.update());
        }
      }, 0)
      return items
    })

    // Zotero.Reader.open(item.id, location
    // if (!Zotero.Reader._open) {
    try {
      ztoolkit.patch(
        Zotero.Reader,
        "open",
        config.addonRef,
        (original) =>
          // @ts-ignore
          async (id: number, location: { pageIndex: number, annotationKey: string }, ...other: any) => {
            if (!location) {
              const tagStartArr = tagsUI.getTagStart()
              if (tagStartArr.length) { 
                const attItem = Zotero.Items.get(id) as Zotero.Item;
                const annoItem = attItem.getAnnotations()
                  .find(annoItem => annoItem.getTags()
                      .find(tag => tagStartArr
                        .find(tagStart => tag.tag.startsWith(tagStart)))
                  )
                if (annoItem) {
                  location = {
                    pageIndex: Number(annoItem.annotationPageLabel) - 1,
                    annotationKey: annoItem.key as string
                  }
                }
              }
            }
            // 修复定位bug
            window.setTimeout(async () => {
              // 随着缩放它会一直闪烁，这个bug，Zotero官方一直没修复
              // 所以将它替换为border形式，即使不消失也不会太影响观感
              const win = (
                (await ztoolkit.Reader.getReader() as _ZoteroReaderInstance)._iframeWindow as any
              ).wrappedJSObject
              ztoolkit.UI.appendElement({
                tag: "style",
                ignoreIfExists: true,
                properties: {
                  innerHTML: `
                    .layer-blink .rect {
                      background-color: transparent !important;
                      border: 2px solid deeppink;
                    }
                  `
                },
              }, win.document.documentElement as any);
            }, 0)
            // 为tab添加标签
            window.setTimeout(async () => {
              
            })
            return original.call(Zotero.Reader, id, location as any, ...other)
          }
      )
    } catch {}
    //   Zotero.Reader._open = true
    // }
  }

  public async addNumberToCollectionTree() {
    if (!Zotero.Prefs.get(`${config.addonRef}.function.addNumberToCollectionTree.enable`) as boolean) { return }
    try {
      ztoolkit.patch(
        ZoteroPane.collectionsView,
        "renderItem",
        config.addonRef,
        (original) =>
          (index: number, selection: object, oldDiv: HTMLDivElement, columns: any[]) => {
            const div = original.call(ZoteroPane.collectionsView, index, selection, oldDiv, columns)

            // div.querySelector("span").style.backgroundColor = "#FFABAB"
            // div.querySelector("span").style.color = "#FFABAB"

            const row = ZoteroPane.collectionsView.getRow(index)
            const ref = row.ref!
            if (index > 0) {
              let key: string;
              try {
                key = JSON.stringify(ref.key || ref) + "collection-add-number"
              } catch { return div }
              window.setTimeout(async () => {
                let getCollectionAllItemNumber = async (c: any) => {
                  const child=await c.getChildItems() as Zotero.Item[]
                  let count = child.length
                  let itemKeys = child.map(s=>s.key)
                  if (c.hasChildCollections()) {
                    let cs = c.getChildCollections()
                    for (let i = 0; i < cs.length; i++) {
                      count += (await getCollectionAllItemNumber(cs[i]) ).count
                      itemKeys.push(... (await getCollectionAllItemNumber(cs[i]) ).itemKeys)
                    }
                  }
                  return {count,itemKeys}
                }
                let setText = (text: string | undefined, force: boolean = false) => {
                  if (text && ((!force && text != this.cache[key]) || force)) {
                    this.cache[key] = text;
                    const primary = div.querySelector(".primary")
                    const numberNode = primary.querySelector(".number")
                    if (numberNode) {
                      numberNode.innerHTML = text
                    } else {
                      ztoolkit.UI.appendElement({
                        tag: "span",
                        classList: [config.addonRef],
                        styles: {
                          display: "inline-block",
                          flex: "1"
                        }
                      }, primary)
                      ztoolkit.UI.appendElement({
                        tag: "span",
                        classList: [config.addonRef, "number"],
                        styles: {
                          marginRight: "6px",
                        },
                        properties: {
                          innerHTML: text
                        }
                      }, primary)
                    }
                  }
                }
  
                // 缓存读取
                if (key in this.cache) {
                  setText(this.cache[key], true)
                }
                // 读取模式
                const modeKey = `${config.addonRef}.addNumberToCollectionTree.mode`
                const mode = Number(Zotero.Prefs.get(modeKey) as string)
                
                // 悄悄更新
                let text: string | undefined = undefined
                if (ref._ObjectType == "Collection") { 
                  let collection = ref;
                  const childItemNumber = (await collection.getChildItems()).length
                  const offspringItemNumberCount = (await getCollectionAllItemNumber(collection)).count
                  const offspringItemNumber = new Set(... (await getCollectionAllItemNumber(collection)).itemKeys).size
                  switch (mode) {
                    case 0:
                      text = childItemNumber;
                      break;
                    case 1:
                      text = offspringItemNumber
                      break;
                    case 2:
                      if (childItemNumber != offspringItemNumber) {
                        text = `<span style="opacity: 0.5; margin-right: 6px;">${childItemNumber}</span>${offspringItemNumber}`
                      } else {
                        text = childItemNumber
                      }
                      break;
                    case 3:
                      if (childItemNumber != offspringItemNumber) {
                        text = `<span style="opacity: 0.5; margin-right: 6px;">${offspringItemNumber}</span>${childItemNumber}`
                      } else {
                        text = childItemNumber
                      }
                      break;
                    default:
                      break
                  }
                }
                else {
                  text = ""
                }
                setText(text as string)
              })
            }
            return div
          }
      )
    } catch {}
  }
}

function dialog(io: {
  attributes: {},
  element: XUL.Element,
  hooks: { accept?: Function, cancel?: Function }
}, width: number, height: number) {
  // @ts-ignore
  window.openDialog(
    `chrome://${config.addonRef}/content/dialog.xul`,
    "zotero-style",
    `chrome,centerscreen,width=${width},height=${height},alwaysRaised=yes,resizable=yes`,
    io
  );
}

interface Record {
  page: number,
  data: {
    [key: string]: string | number
  }
}