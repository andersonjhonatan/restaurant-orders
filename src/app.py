from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse

from models.ingredient import Restriction
from services.menu_builder import MenuBuilder

RESTAURANT_NAME = "Sabor da Casa"
OWNER_NAME = "Vanuza"
WHATSAPP = "87 98839-5085"
WHATSAPP_URL = "https://wa.me/5587988395085"
SLOGAN = "Da minha cozinha para sua família"
BASE_DIR = Path(__file__).resolve().parents[1]
LOGO_PATH = BASE_DIR / "assets" / "logo-sabor-da-casa.svg"

app = FastAPI(
    title=RESTAURANT_NAME,
    description=(
        "API de cardápio e pedidos do Sabor da Casa, "
        "administrado por Vanuza."
    ),
    version="1.0.0",
    contact={"name": OWNER_NAME, "url": WHATSAPP_URL},
)
menu_builder = MenuBuilder()

restriction_options = {k: {"value": k} for k in Restriction._member_names_}


@app.get("/info", tags=["restaurante"])
def get_restaurant_info():
    return {
        "name": RESTAURANT_NAME,
        "owner": OWNER_NAME,
        "slogan": SLOGAN,
        "whatsapp": WHATSAPP,
        "whatsapp_url": WHATSAPP_URL,
        "logo": "/brand/logo",
    }


@app.get("/brand/logo", include_in_schema=False)
def get_restaurant_logo():
    return FileResponse(LOGO_PATH, media_type="image/svg+xml")


@app.get("/", tags=["menu"])
def get_menu(
    restriction: str = Query(default="", examples=restriction_options)
):
    return menu_builder.get_main_menu(
        restriction=Restriction._member_map_.get(restriction)
    )


@app.post("/order", tags=["menu"], status_code=status.HTTP_201_CREATED)
def make_dish_order(dish_name: str):
    try:
        menu_builder.make_order(dish_name)
    except ValueError as err:
        if str(err) == "Dish does not exist":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(err),
            )
        raise HTTPException(
            status_code=status.HTTP_406_NOT_ACCEPTABLE,
            detail="Dish can't be prepared due to missing ingredients",
        )
