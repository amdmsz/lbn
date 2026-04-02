import { UserStatus, type RoleCode } from "@prisma/client";
import { canManageMasterData } from "@/lib/auth/access";
import {
  buildTagOptionLabel,
  parseMasterDataNotice,
} from "@/lib/master-data/metadata";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type MasterDataViewer = {
  id: string;
  role: RoleCode;
};

function requireMasterDataAccess(role: RoleCode) {
  if (!canManageMasterData(role)) {
    throw new Error("You do not have access to master data settings.");
  }
}

export async function getMasterDataOverviewData(
  viewer: MasterDataViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  requireMasterDataAccess(viewer.role);

  const [
    userCount,
    activeUserCount,
    teamCount,
    tagGroupCount,
    tagCategoryCount,
    tagCount,
    categoryCount,
    dictionaryTypeCount,
    dictionaryItemCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        userStatus: UserStatus.ACTIVE,
      },
    }),
    prisma.team.count(),
    prisma.tagGroup.count(),
    prisma.tagCategory.count(),
    prisma.tag.count(),
    prisma.category.count(),
    prisma.dictionaryType.count(),
    prisma.dictionaryItem.count(),
  ]);

  return {
    notice: parseMasterDataNotice(rawSearchParams),
    overview: {
      userCount,
      activeUserCount,
      teamCount,
      tagGroupCount,
      tagCategoryCount,
      tagCount,
      categoryCount,
      dictionaryTypeCount,
      dictionaryItemCount,
    },
    organizationCards: [
      {
        href: "/settings/users",
        title: "账号管理",
        description: "维护内部账号、角色、状态与密码流程。",
        value: userCount,
        subValue: `启用 ${activeUserCount}`,
      },
      {
        href: "/settings/teams",
        title: "团队管理",
        description: "维护团队结构、主管与成员归属。",
        value: teamCount,
        subValue: "组织关系",
      },
    ],
    masterDataCards: [
      {
        href: "/settings/tag-groups",
        title: "标签组",
        description: "承载一类业务标签的大类。",
        value: tagGroupCount,
        subValue: `${tagCategoryCount} 个分类`,
      },
      {
        href: "/settings/tags",
        title: "标签",
        description: "客户和线索直接使用的业务标签。",
        value: tagCount,
        subValue: "标签资产",
      },
      {
        href: "/settings/dictionaries",
        title: "字典与类目",
        description: "维护字典类型、字典项与基础类目。",
        value: categoryCount + dictionaryTypeCount + dictionaryItemCount,
        subValue: `${dictionaryTypeCount} 个类型`,
      },
    ],
    cards: [
      {
        href: "/settings/tag-groups",
        title: "标签组",
        description: "承载一类业务标签的大类。",
        value: tagGroupCount,
      },
      {
        href: "/settings/tag-categories",
        title: "标签分类",
        description: "标签组下的二级分类。",
        value: tagCategoryCount,
      },
      {
        href: "/settings/tags",
        title: "标签",
        description: "客户和线索直接使用的业务标签。",
        value: tagCount,
      },
      {
        href: "/settings/dictionaries",
        title: "字典中心",
        description: "通用分类、字典类型和字典项。",
        value: categoryCount + dictionaryTypeCount + dictionaryItemCount,
      },
    ],
  };
}

export async function getTagGroupPageData(
  viewer: MasterDataViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  requireMasterDataAccess(viewer.role);

  const items = await prisma.tagGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      isActive: true,
      _count: {
        select: {
          categories: true,
          tags: true,
        },
      },
    },
  });

  return {
    notice: parseMasterDataNotice(rawSearchParams),
    items,
  };
}

export async function getTagCategoryPageData(
  viewer: MasterDataViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  requireMasterDataAccess(viewer.role);

  const [items, groups] = await Promise.all([
    prisma.tagCategory.findMany({
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        groupId: true,
        group: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            tags: true,
          },
        },
      },
    }),
    prisma.tagGroup.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
  ]);

  return {
    notice: parseMasterDataNotice(rawSearchParams),
    items,
    groups,
  };
}

export async function getTagsPageData(
  viewer: MasterDataViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  requireMasterDataAccess(viewer.role);

  const [items, groups, categories] = await Promise.all([
    prisma.tag.findMany({
      orderBy: [
        { group: { sortOrder: "asc" } },
        { category: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        color: true,
        description: true,
        sortOrder: true,
        isActive: true,
        groupId: true,
        categoryId: true,
        group: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            customerTags: true,
            leadTags: true,
          },
        },
      },
    }),
    prisma.tagGroup.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
    prisma.tagCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        groupId: true,
      },
    }),
  ]);

  return {
    notice: parseMasterDataNotice(rawSearchParams),
    items,
    groups,
    categories,
  };
}

export async function getDictionariesPageData(
  viewer: MasterDataViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  requireMasterDataAccess(viewer.role);

  const [categories, types, items] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        _count: {
          select: {
            dictionaryTypes: true,
          },
        },
      },
    }),
    prisma.dictionaryType.findMany({
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        categoryId: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        category: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    }),
    prisma.dictionaryItem.findMany({
      orderBy: [{ type: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        typeId: true,
        code: true,
        label: true,
        value: true,
        description: true,
        sortOrder: true,
        isActive: true,
        type: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    }),
  ]);

  return {
    notice: parseMasterDataNotice(rawSearchParams),
    categories,
    types,
    items,
  };
}

export async function getActiveTagOptions() {
  const tags = await prisma.tag.findMany({
    where: { isActive: true },
    orderBy: [
      { group: { sortOrder: "asc" } },
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      group: {
        select: {
          name: true,
        },
      },
      category: {
        select: {
          name: true,
        },
      },
    },
  });

  return tags.map((tag) => ({
    ...tag,
    label: buildTagOptionLabel(tag),
  }));
}
