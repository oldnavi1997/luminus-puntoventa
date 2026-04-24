export type LensAction = "direct" | "form";

export interface SubVariant {
  id: string;
  label: string;
  description?: string | string[];
  price?: number;
  priceRange?: string;
  note?: string;
  action: LensAction;
}

export interface SubType {
  id: string;
  label: string;
  description?: string | string[];
  price?: number;
  priceRange?: string;
  action: LensAction;
  variants?: SubVariant[];
}

export interface Level1Option {
  id: "sin_medida" | "con_medida" | "solo_montura";
  label: string;
  description: string;
  price?: number;
  action: LensAction;
  subTypes?: SubType[];
}

export const LENS_TREE: Level1Option[] = [
  {
    id: "sin_medida",
    label: "Sin medida",
    description: "Lunas sin graduación para uso cotidiano",
    action: "direct",
    subTypes: [
      {
        id: "descanso",
        label: "Descanso",
        description: "Luna sin graduación para descanso visual, poseen Filtro de luz azul, Antireflex y UV400",
        price: 80,
        action: "direct",
      },
      {
        id: "fotocromatico",
        label: "Fotocromático clásico",
        description: [
          "Luna fotocromática sin graduación",
          "Se oscurece automáticamente con la luz solar",
          "Regresa a claro en interiores",
          "Protección UV integrada",
        ],
        price: 200,
        action: "direct",
      },
      {
        id: "transition",
        label: "Transition Gen S",
        description: [
          "Última generación de lentes fotocromáticos",
          "Activación y recuperación más rápida",
          "Disponible con antirreflejo Base Kodak o Sapphire",
        ],
        action: "direct",
        variants: [
          {
            id: "ar16",
            label: "Base Kodak",
            description: [
              "Se oscurecen al aire libre y recuperan el tono en interiores",
              "Se oscurecen en segundos y vuelven a ser claros más rápido que nunca",
              "Ideales para personas con exposición a dispositivos digitales",
              "Bloquean el 100% de los rayos UV y UVB",
            ],
            price: 650,
            action: "direct",
          },
          {
            id: "sapphire",
            label: "Sapphire",
            description: [
              "Capa adicional de protección sobre tus lentes",
              "Elimina los reflejos molestos",
              "Hidrofóbico y oleofóbico: repele agua, suciedad y grasa",
              "Lentes más limpios por más tiempo",
              "Visión clara y nítida, limpieza más rápida y sencilla",
            ],
            price: 850,
            action: "direct",
          },
        ],
      },
    ],
  },
  {
    id: "con_medida",
    label: "Con medida",
    description: "Luna graduada según tu prescripción óptica",
    action: "direct",
    subTypes: [
      {
        id: "nk",
        label: "Lunas NK",
        description: [
          "Luna orgánica de alta calidad",
          "Ligera y resistente a los impactos",
          "Buena claridad óptica",
        ],
        priceRange: "S/140 - S/230",
        action: "form",
      },
      {
        id: "policarbonato",
        label: "Policarbonato",
        description: [
          "Material resistente a impactos",
          "Ideal para uso diario y actividades activas",
          "Liviano y duradero",
        ],
        action: "form",
        variants: [
          {
            id: "convencional",
            label: "Convencional",
            description: [
              "Luna policarbonato estándar",
              "Tratamiento básico de dureza",
              "Excelente relación calidad-precio",
            ],
            priceRange: "S/190 - S/280",
            action: "form",
          },
          {
            id: "crizal_sapphire",
            label: "Crizal Sapphire",
            description: [
              "Antirreflejo premium de alta tecnología",
              "Protección UV superior",
              "Mayor resistencia a rayaduras",
            ],
            price: 330,
            note: "Disponible hasta Cilindro -2",
            action: "form",
          },
        ],
      },
      {
        id: "fotocromatico",
        label: "Fotocromático clásico",
        description: [
          "Se oscurece automáticamente con la luz solar",
          "Regresa a claro en interiores",
          "Protección UV integrada",
        ],
        action: "form",
        variants: [
          {
            id: "con_ficha",
            label: "Con ficha",
            description: [
              "Luna fotocromática con tu graduación",
              "Lente correctivo y de sol en uno",
              "Comodidad visual en todo momento",
            ],
            priceRange: "S/250 - S/320",
            action: "form",
          },
        ],
      },
      {
        id: "transition",
        label: "Transition Gen S",
        description: [
          "Última generación de lentes fotocromáticos",
          "Activación y recuperación más rápida",
          "Disponible con antirreflejo Base Kodak o Sapphire",
        ],
        action: "form",
        variants: [
          {
            id: "ar16",
            label: "Base Kodak",
            description: [
              "Se oscurecen al aire libre y recuperan el tono en interiores",
              "Se oscurecen en segundos y vuelven a ser claros más rápido que nunca",
              "Ideales para personas con exposición a dispositivos digitales",
              "Bloquean el 100% de los rayos UV y UVB",
              "Lentes con medida y de sol a la vez",
            ],
            price: 650,
            action: "form",
          },
          {
            id: "sapphire",
            label: "Sapphire",
            description: [
              "Capa adicional de protección sobre tus lentes",
              "Elimina los reflejos molestos",
              "Hidrofóbico y oleofóbico: repele agua, suciedad y grasa",
              "Lentes más limpios por más tiempo",
              "Visión clara y nítida, limpieza más rápida y sencilla",
            ],
            price: 850,
            action: "form",
          },
        ],
      },
      {
        id: "alto_indice",
        label: "Alto índice",
        description: [
          "Para graduaciones altas (esfera > ±4.00)",
          "Lentes más delgadas y ligeras que las convencionales",
          "Mayor confort y estética en armazones de cualquier tipo",
        ],
        price: 650,
        action: "form",
      },
    ],
  },
  {
    id: "solo_montura",
    label: "Solo montura",
    description: "Solo montura — se recomienda el cambio de las lunas base del marco",
    action: "direct",
  },
];

export function getLensLabel(
  lensType: string,
  subType?: string | null,
  variant?: string | null
): string {
  const parts: string[] = [];
  const l1 = LENS_TREE.find((o) => o.id === lensType);
  if (!l1) return lensType;
  parts.push(l1.label);
  if (subType) {
    const st = l1.subTypes?.find((s) => s.id === subType);
    if (st) {
      parts.push(st.label);
      if (variant) {
        const v = st.variants?.find((v) => v.id === variant);
        if (v) parts.push(v.label);
      }
    }
  }
  return parts.join(" · ");
}
