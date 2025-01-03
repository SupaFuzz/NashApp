create table mezo.nthree_albums (
    id                  serial primary key,
    submitter           int not null,
    create_date         timestamp default now(),
    modified_date       timestamp default now(),
    last_modified_by    int not null,

    album_name          varchar(255) not null,
    artist              varchar(255) not null,
    label               varchar(255) not null,
    release_date        timestamp default null,
    repress             boolean default false,
    num_disks           integer default 1,
    condition           varchar(20) default 'fair',

    constraint          fk_user foreign key(submitter) references basic_auth.users(user_id) on delete no action
);

grant all on mezo.nthree_albums to mezo_user;
grant usage, select on sequence mezo.nthree_albums_id_seq to mezo_user;

-- triggers for create
create trigger nthree_albums_create before insert on mezo.nthree_albums
    for each row
    execute procedure api.handle_create();

-- triggers for modify
create trigger nthree_albums_modify before update on mezo.nthree_albums
    for each row
    execute procedure api.handle_modify();

-- make a view in the api namespace
create view api.nthree_albums as select * from mezo.nthree_albums;
grant select on api.nthree_albums to api_user;

-- NOTE: you gotta restart postgrest after executing the above
