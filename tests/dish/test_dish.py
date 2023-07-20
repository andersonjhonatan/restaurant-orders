import pytest
from src.models.dish import Dish  # noqa: F401, E261, E501
from src.models.ingredient import Ingredient, Restriction


# Req 2
def test_dish():
    camarao = Dish("camarão", 25.49)
    peixada = Dish("peixada", 85.00)

    with pytest.raises(ValueError):
        Dish("camarão", -77.55)

    with pytest.raises(TypeError):
        Dish("camarão", "77.55")

    assert camarao.name == "camarão"
    assert camarao.recipe == {}
    assert camarao.price == 25.49

    assert camarao.get_ingredients() == set()
    assert camarao == Dish("camarão", 25.49)
    assert camarao != Dish("peixada", 75.50)

    assert hash(camarao) == hash(camarao)
    assert hash(camarao) != hash(peixada)
    assert repr(camarao) == "Dish('camarão', R$25.49)"
    assert repr(camarao) != "Dish('peixada', R$75.50)"

    camarao.add_ingredient_dependency(Ingredient("salmão"), 2)
    assert camarao.get_restrictions() == {
        Restriction.SEAFOOD,
        Restriction.ANIMAL_DERIVED,
        Restriction.ANIMAL_MEAT,
    }
    assert camarao.get_ingredients() == {Ingredient("salmão")}
